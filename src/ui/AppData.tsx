// App-wide context: runs initDataLayer() once at launch and exposes the local
// user, the account, the sync state and a few shared UI values. Screens call
// the repositories themselves; no SQL lives here.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDataLayer, userRepo } from '@/db';
import type { User } from '@/db';
import type { AuthUser, SyncResult } from '@/sync';
import { currentAuthUser } from '@/sync';
import { todayDate } from '@/lib/helpers';
import { migrateToMultiReminderIfNeeded, rescheduleEverything } from '@/lib/notifications';
import { maybeShowInterstitial } from '@/lib/ads';
import { runSync } from '@/sync';
import { ACCOUNTS_ENABLED } from '@/config';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { usePlusState } from '@/plus/plusStore';
import { drainWidgetQueue, refreshWidget } from '@/widget/widgetData';
import { onWidgetAction } from '@/widget/widgetQueue';

interface AppData {
  user: User;
  // Re-reads the local user (e.g. its email after signing in).
  refreshUser: () => void;
  // The signed-in account (null = none). Kept here because the header's
  // ProfileButton shows its avatar on every screen; callers refresh it after
  // sign-in, sign-out and deletion.
  authUser: AuthUser | null;
  refreshAuthUser: () => void;
  // Bumped when data changes off-screen (the ＋ menu, a widget tap). List hooks
  // reload on it, since closing a modal fires no focus event.
  dataVersion: number;
  notifyDataChanged: () => void;
  // The day shown on Today, so the ＋ menu can default a new task to it.
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  // — Sync state, shared by automatic and manual rounds so a persistent error
  // (RLS conflict, expired session, stale cloud schema) reaches Profile.
  syncResult: SyncResult | null;
  // Last SUCCESSFUL sync (epoch ms), persisted; null = never.
  lastSyncAt: number | null;
  syncing: boolean;
  // A manual round; returns the result for callers that branch on it.
  syncNow: () => Promise<SyncResult>;
  // After sign-out or account deletion, so "Last backup" doesn't describe a gone account.
  clearSyncStatus: () => void;
}

const LAST_SYNC_KEY = 'sync:lastSuccessAt';

// Foreground sync at most this often: not on every app switch, but a session
// left open for hours still gets backed up.
const FOREGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData yalnızca <AppDataProvider> içinde kullanılabilir.');
  }
  return value;
}

// For components that may render outside the provider (e.g. form fields in tests).
export function useOptionalAppData(): AppData | null {
  return useContext(AppDataContext);
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const plusState = usePlusState();
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Last sync ATTEMPT, for the foreground gate: with lastSyncAt alone, a setup
  // that always fails would retry on every focus.
  const lastSyncAttemptRef = useRef(0);
  // The day reminders were last rebuilt: their validity is date-bound, so they
  // are rebuilt once per day rollover.
  const lastRescheduleDayRef = useRef<string | null>(null);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  // Launch, foreground and the Profile button all sync through here.
  const syncUser = useCallback(async (userId: string): Promise<SyncResult> => {
    if (!ACCOUNTS_ENABLED) return { status: 'disabled' };
    lastSyncAttemptRef.current = Date.now();
    setSyncing(true);
    try {
      const r = await runSync(userId);
      // Another round is running: keep its (or a real error's) state on screen.
      if (r.status === 'busy') return r;
      setSyncResult(r);
      if (r.status === 'ok') {
        const at = r.at ?? Date.now();
        setLastSyncAt(at);
        AsyncStorage.setItem(LAST_SYNC_KEY, String(at)).catch(() => {});
        // Another device's changes landed: reminders, the open screen and the
        // widget were built from the old rows.
        if ((r.pulled ?? 0) > 0) {
          rescheduleEverything(userId);
          setDataVersion((v) => v + 1);
        }
      }
      return r;
    } finally {
      setSyncing(false);
    }
  }, []);

  const clearSyncStatus = useCallback(() => {
    setSyncResult(null);
    setLastSyncAt(null);
    AsyncStorage.removeItem(LAST_SYNC_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(LAST_SYNC_KEY).then((v) => {
      const n = v ? Number(v) : NaN;
      if (Number.isFinite(n)) setLastSyncAt(n);
    });
  }, []);

  useEffect(() => {
    initDataLayer()
      .then(({ user }) => {
        setUser(user);
        // Rebuild reminders from the DB (a reboot or update can clear them),
        // after the one-time multi-reminder migration.
        migrateToMultiReminderIfNeeded()
          .catch(() => {})
          .finally(() => {
            lastRescheduleDayRef.current = todayDate();
            rescheduleEverything(user.id);
          });
        // Sends nothing unless the user signed in (sync/auth.ts).
        syncUser(user.id);
        refreshAuthUser();
        // Cold start is one of the two ad triggers (lib/ads.ts).
        maybeShowInterstitial();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshUser = useCallback(() => {
    setUser(userRepo.getOrCreateLocal());
  }, []);

  const refreshAuthUser = useCallback(() => {
    currentAuthUser().then(setAuthUser);
  }, []);

  // Repaint the home-screen widgets on every data change and when the theme
  // changes (the snapshot carries its colors). Today's check-offs reload
  // locally and refresh the widget themselves.
  useEffect(() => {
    if (user) refreshWidget(user.id);
  }, [user, dataVersion, colors.bg, colors.primary, plusState.plus]);

  // Widget taps are queued by the headless handler, which can't use SQLite
  // (widget/widgetQueue.ts). They're written once the user is ready, on every
  // foreground, and right away while the app is alive.
  useEffect(() => {
    if (!user) return;
    const drain = () => {
      drainWidgetQueue()
        .then((n) => {
          if (n > 0) notifyDataChanged();
        })
        .catch(() => {});
    };
    drain();
    const unsubscribe = onWidgetAction(drain);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drain();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, [user, notifyDataChanged]);

  // On every foreground: widget, sync (Android keeps the process alive for
  // days, so launch alone isn't enough), the ad gate, and reminders after a
  // day rollover.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !user) return;
      refreshWidget(user.id);
      if (Date.now() - lastSyncAttemptRef.current >= FOREGROUND_SYNC_MIN_GAP_MS) {
        syncUser(user.id);
      }
      maybeShowInterstitial();
      const today = todayDate();
      if (lastRescheduleDayRef.current !== today) {
        lastRescheduleDayRef.current = today;
        rescheduleEverything(user.id);
      }
    });
    return () => sub.remove();
  }, [user, syncUser]);

  // Memoized so consumers only re-render when a field actually changes.
  const value = useMemo<AppData | null>(
    () =>
      user
        ? {
            user,
            refreshUser,
            authUser,
            refreshAuthUser,
            dataVersion,
            notifyDataChanged,
            selectedDate,
            setSelectedDate,
            syncResult,
            lastSyncAt,
            syncing,
            syncNow: () => syncUser(user.id),
            clearSyncStatus,
          }
        : null,
    [
      user,
      refreshUser,
      authUser,
      refreshAuthUser,
      dataVersion,
      notifyDataChanged,
      selectedDate,
      syncResult,
      lastSyncAt,
      syncing,
      syncUser,
      clearSyncStatus,
    ]
  );

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>{t('app.dataLayerError')}</Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
      </View>
    );
  }

  // value is null exactly when user is.
  if (!user || !value) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 13,
    textAlign: 'center',
  },
});
