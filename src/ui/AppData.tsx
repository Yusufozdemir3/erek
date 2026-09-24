// App-wide shared data context.
// Its only job: run initDataLayer() ONCE at launch and expose the active user
// (anonymous or with an account) to every screen. Screens get user.id from
// here, then call repository functions directly - no SQL leaks into the context.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDataLayer, userRepo } from '@/db';
import type { User } from '@/db';
import type { SyncResult } from '@/sync';
import { todayDate } from '@/lib/helpers';
import { migrateToMultiReminderIfNeeded, rescheduleEverything } from '@/lib/notifications';
import { maybeShowInterstitial } from '@/lib/ads';
import { runSync } from '@/sync';
import { ACCOUNTS_ENABLED } from '@/config';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { refreshWidget } from '@/widget/widgetData';

interface AppData {
  user: User;
  // Re-reads the local user from the DB (e.g. so the email updates after
  // linking an account). Refreshes the user reference held by screens.
  refreshUser: () => void;
  // Increments whenever data is added from somewhere off-screen (e.g. the
  // central ＋ menu). List hooks put this in their reload dependency, so the
  // visible list refreshes even without a focus change (closing a modal on
  // top doesn't fire a focus event).
  dataVersion: number;
  notifyDataChanged: () => void;
  // The day currently being viewed on the "Today" screen ("YYYY-MM-DD"). Since
  // the central ＋ menu (AddSheet) lives in the tab bar, it doesn't know which
  // day is displayed; sharing it here lets a new task default to the viewed day.
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  // Preference to hide completed tasks/habits on the "Today" screen — set in
  // Profile (persisted in AsyncStorage), a persistent preference rather than a
  // screen-specific filter.
  hideCompleted: boolean;
  setHideCompleted: (v: boolean) => void;
  // — SYNC STATE —
  // The result of the last round (automatic or manual, doesn't matter). The
  // Profile screen shows this; the reason it's kept HERE is that automatic
  // rounds run even without the screen open: the launch sync's result used to
  // not be written anywhere, and a persistent error (RLS conflict, expired
  // session, stale cloud schema) NEVER surfaced to the user — there was no way
  // to find out they had no backup.
  syncResult: SyncResult | null;
  // The time of the last SUCCESSFUL sync (epoch ms). Persisted across app
  // restarts (AsyncStorage). null = this device has never had a successful sync.
  lastSyncAt: number | null;
  syncing: boolean;
  // Manual sync (the button in Profile, the first round after sign-in). Updates
  // the SAME state as automatic rounds. Returns the result because some callers
  // (LoginScreen) branch their flow on it — but they must all go through here so
  // the "last backup" timestamp and error state stay collected in one place.
  syncNow: () => Promise<SyncResult>;
}

const HIDE_COMPLETED_KEY = 'today:hideCompleted';
const LAST_SYNC_KEY = 'sync:lastSuccessAt';

// We don't want to sync EVERY time the app comes to the foreground (needless
// traffic/battery for a user switching between apps); but we also don't want
// to keep data stuck on the device during a session left open for hours. The
// balance: at most once per this interval.
const FOREGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

const AppDataContext = createContext<AppData | null>(null);

// Screens access the user via this hook. Throws early if called outside the Provider.
export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData yalnızca <AppDataProvider> içinde kullanılabilir.');
  }
  return value;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [hideCompleted, setHideCompletedState] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  // The last sync ATTEMPT (successful or not) — used by the foreground
  // trigger's interval gate. Kept separate from lastSyncAt: in a setup that
  // always errors, lastSyncAt would never advance and the gate would never
  // close (retrying on every focus).
  const lastSyncAttemptRef = useRef(0);
  // Which DAY reminders were last rescheduled on ("YYYY-MM-DD").
  // Their validity is date-dependent (habit start/end, task due date, goal
  // deadline) but OS triggers don't know dates; so they need to be rebuilt once
  // per day rollover. A DAY gate, not a duration one: everything that needs
  // fixing is tied to the calendar day.
  const lastRescheduleDayRef = useRef<string | null>(null);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  // The single sync entry point: launch, coming to foreground, and the button
  // in Profile all go through here — so state stays collected in one place and
  // the three paths can never end up inconsistent.
  const syncUser = useCallback(async (userId: string): Promise<SyncResult> => {
    if (!ACCOUNTS_ENABLED) return { status: 'disabled' };
    lastSyncAttemptRef.current = Date.now();
    setSyncing(true);
    try {
      const r = await runSync(userId);
      // 'busy' isn't an error (see SyncResult): it means another round is in
      // progress. Must NOT overwrite state — otherwise the result of a
      // manually started round, or a real error on screen, would get wiped out
      // by a colliding automatic round.
      if (r.status === 'busy') return r;
      setSyncResult(r);
      if (r.status === 'ok') {
        const at = r.at ?? Date.now();
        setLastSyncAt(at);
        AsyncStorage.setItem(LAST_SYNC_KEY, String(at)).catch(() => {});
      }
      return r;
    } finally {
      setSyncing(false);
    }
  }, []);

  const setHideCompleted = useCallback((v: boolean) => {
    setHideCompletedState(v);
    AsyncStorage.setItem(HIDE_COMPLETED_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_COMPLETED_KEY).then((v) => {
      if (v === '1') setHideCompletedState(true);
    });
    // Last successful sync timestamp: the answer to "how old is my backup"
    // must survive an app restart too.
    AsyncStorage.getItem(LAST_SYNC_KEY).then((v) => {
      const n = v ? Number(v) : NaN;
      if (Number.isFinite(n)) setLastSyncAt(n);
    });
  }, []);

  useEffect(() => {
    // Sets up the schema and guarantees an anonymous user. Runs only on first launch.
    initDataLayer()
      .then(({ user }) => {
        setUser(user);
        // On launch, reschedule existing reminders based on the DB (a device
        // reboot / app update may have cleared them). During the migration
        // from the old single-reminder schema to multiple reminders, the OS
        // notification queue is nuked once on first launch (see the file-header
        // comment) — right after that, the reschedule* call below rebuilds
        // everything from scratch with the new schema, based on current DB
        // state. Exits silently if permission is missing.
        migrateToMultiReminderIfNeeded()
          .catch(() => {})
          .finally(() => {
            lastRescheduleDayRef.current = todayDate();
            rescheduleEverything(user.id);
          });
        // Sync once in the background on launch (silently skipped if not
        // configured). IF THE USER ISN'T SIGNED IN THIS CALL SENDS NOTHING:
        // runSync's first step asks ensureSignedIn, which returns null when
        // there's no session, and the round ends with 'disabled' (an anonymous
        // session is NEVER opened — see sync/auth.ts). So data only ever leaves
        // the device once the user has knowingly signed into an account.
        // The result is written to syncResult (Profile shows it) — the .catch
        // here used to be DEAD CODE: runSync never throws, it returns the
        // error; so a persistent sync failure never reached anywhere.
        syncUser(user.id);
        // Cold launch — one of the TWO triggers for the full-screen interstitial
        // ad (the other is AppState 'active' below — see the file-header
        // comment in lib/ads.ts). It enforces its own frequency cap, no extra
        // gate needed here.
        maybeShowInterstitial();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshUser = useCallback(() => {
    setUser(userRepo.getOrCreateLocal());
  }, []);

  // Refresh the home-screen widget once the user is ready and on every data
  // change. dataVersion increments via notifyDataChanged (adding via the ＋
  // menu, a timer commit, a goal update…) → this effect covers all of them.
  // Habit check-offs on the Today screen use a local reload, so there's a
  // separate call there too. refreshWidget is a silent no-op outside Android and in Expo Go.
  useEffect(() => {
    if (user) refreshWidget(user.id);
  }, [user, dataVersion]);

  // Also refresh when the app comes to the foreground: time spent in the
  // background, a day rollover, and theme/language changes (made in Profile)
  // should reflect on the widget on the next open.
  //
  // ALSO SYNC: sync's ONLY automatic trigger used to be this provider's mount,
  // i.e. a COLD launch. Since Android keeps the process alive for days, a user
  // who opens the app daily could go days without `runSync` ever running;
  // everything marked during that time would stay device-only (lost if the
  // phone is lost) and a second device would never update — "cloud backup"
  // wouldn't hold up in practice. See FOREGROUND_SYNC_MIN_GAP_MS for the interval gate.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !user) return;
      refreshWidget(user.id);
      if (Date.now() - lastSyncAttemptRef.current >= FOREGROUND_SYNC_MIN_GAP_MS) {
        syncUser(user.id);
      }
      // Coming to foreground — the second trigger for the interstitial ad (see
      // the cold-launch call above). DELIBERATELY not on habit/task
      // COMPLETION — see the file-header comment in lib/ads.ts.
      maybeShowInterstitial();
      // If the day changed, rebuild reminders from scratch for the current
      // date: a habit that ended yesterday should go quiet, one starting today
      // should be scheduled. Since the process can stay alive for days, doing
      // this only at launch wasn't enough (see the header comment on rescheduleEverything).
      const today = todayDate();
      if (lastRescheduleDayRef.current !== today) {
        lastRescheduleDayRef.current = today;
        rescheduleEverything(user.id);
      }
    });
    return () => sub.remove();
  }, [user, syncUser]);

  // Memoize the context value: producing a new object on every render was
  // forcing ALL consumers (every screen, every list hook) to re-render even
  // for fields that didn't change. Most hooks (via useCallback) are already
  // stable; what actually changes is sync state and the selected day.
  const value = useMemo<AppData | null>(
    () =>
      user
        ? {
            user,
            refreshUser,
            dataVersion,
            notifyDataChanged,
            selectedDate,
            setSelectedDate,
            hideCompleted,
            setHideCompleted,
            syncResult,
            lastSyncAt,
            syncing,
            syncNow: () => syncUser(user.id),
          }
        : null,
    [
      user,
      refreshUser,
      dataVersion,
      notifyDataChanged,
      selectedDate,
      hideCompleted,
      setHideCompleted,
      syncResult,
      lastSyncAt,
      syncing,
      syncUser,
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

  // value is null whenever user is null (the useMemo above) — the two move
  // together, so null is never passed to the provider past this point.
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
  // Colors are supplied inline at render time based on the theme (backgroundColor/color).
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
