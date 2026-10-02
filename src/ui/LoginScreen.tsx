// Login screen — Google ONLY (a deliberate product decision). The email+password
// flow wasn't deleted, it's just hidden (see app/account.tsx): can be re-enabled
// later if needed.
//
// Since Google has no password, there's also no "forgot password" class of
// lockout — that was one of the reasons ACCOUNTS_ENABLED is off (config.ts).
//
// Used in TWO places, same component:
//   - LoginGate: full screen ONCE on first launch (OnboardingGate pattern, manages
//     its own flag). Can be skipped via "skip for now" — the app works fully
//     without login too, offline-first isn't broken.
//   - app/login.tsx: a modal route opened from Profile (a user who skipped signs
//     in later from here; that's why the "skip" button is hidden there).

import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { ACCOUNTS_ENABLED } from '@/config';
import { userRepo } from '@/db';
import { cancelAllReminders, rescheduleEverything } from '@/lib/notifications';
import {
  classifySignIn,
  currentAuthUser,
  currentUid,
  GoogleSignInCancelled,
  isGoogleSignInConfigured,
  isSyncConfigured,
  prepareFullResync,
  resolveAccountSwitch,
  signInWithGoogle,
} from '@/sync';
import { onOnboardingDone, ONBOARDING_SEEN_KEY } from '@/ui/Onboarding';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = 'login:seen';

export interface LoginScreenProps {
  /** Sign-in succeeded or the user skipped — closing is the caller's responsibility. */
  onDone: () => void;
  /** Whether "skip for now" is shown (yes on the launch gate, no when opened from Profile). */
  canSkip?: boolean;
}

export function LoginScreen({ onDone, canSkip = false }: LoginScreenProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // The first pass after sign-in also goes through AppData's syncNow (runSync is
  // NOT called directly): keeps the "last backup" timestamp and sync error state
  // consolidated in one place.
  const { user, refreshUser, refreshAuthUser, notifyDataChanged, syncNow } = useAppData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();

      // ACCOUNT-SWITCH CHECK (before the first push). Since local ids don't
      // change when the account changes, pushing data that was already sent to a
      // different account as-is would get rejected by RLS and permanently lock up
      // sync. See sync/syncEngine.ts (classifySignIn).
      // NO QUESTION IS ASKED any more ("merge or replace?" used to be — a
      // technical decision users shouldn't have to make). Sign-out now forgets
      // the account's data on the device (see "DATA BELONGS TO THE ACCOUNT" in
      // syncEngine.ts), so 'switch' only happens with data left behind by an
      // older version — and resolveAccountSwitch settles it so nothing is lost.
      const uid = await currentUid();
      const kind = uid ? await classifySignIn(uid) : 'fresh';
      if (kind === 'switch') {
        await resolveAccountSwitch();
        // Merge regenerated every id, replace deleted every row: the triggers in
        // the OS notification queue now point at ids that no longer exist
        // (cancelHabitReminders(newId) can never find them, so they'd fire
        // forever, next to the rebuilt ones). Nuke + rebuild RIGHT HERE, not
        // after the sync: this used to sit behind the sync-error early return
        // below, so a switch made offline left the orphans in place. Whatever
        // the sync pulls in afterwards gets scheduled by AppData.syncNow.
        await cancelAllReminders();
        await rescheduleEverything(user.id);
        notifyDataChanged();
      } else if (kind === 'fresh') {
        // This device's data was never sent to any account (or the account it was
        // linked to was deleted — deleteAccountAndData clears the ownership stamp).
        // Rows may still be marked synced=1, so all of them need to be resent.
        await prepareFullResync();
      }
      // kind === 'same': NO PREP NEEDED. The data already belongs to this account;
      // pending rows are already synced=0 (every repo write marks them that way)
      // and the watermarks are valid for this account. This used to call
      // prepareFullResync() here too: for someone who'd been using the app for
      // years, that meant re-pushing tens of thousands of rows plus re-fetching
      // every table from scratch on every sign-in — a costly round trip in mobile
      // data and battery that gained nothing.

      // Write the email into the local user record (upgrade to an account-linked state).
      const authUser = await currentAuthUser();
      if (authUser?.email) userRepo.upgradeToAccount(user.id, authUser.email);

      const result = await syncNow();
      if (result.status === 'error') {
        setError(
          result.ownershipConflict ? t('sync.ownershipConflict') : (result.message ?? '')
        );
        return;
      }

      refreshUser();
      refreshAuthUser();
      onDone();
    } catch (e) {
      // Backing out isn't an error: showing red error text to a user who just
      // closed the account picker would be the wrong feedback.
      if (!(e instanceof GoogleSignInCancelled)) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      {canSkip && (
        <Pressable
          style={styles.skip}
          onPress={onDone}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('login.skip')}
        >
          <Text style={styles.skipText}>{t('login.skip')}</Text>
        </Pressable>
      )}

      <View style={styles.body}>
        <Text style={styles.emoji}>☁️</Text>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.footer}>
        {error != null && <Text style={styles.error}>{error}</Text>}

        {/* If configuration is missing, the button is NOT rendered at all: showing
            the reason is more honest than a button that errors on every tap (only
            seen in dev builds — .env is always populated in production). */}
        {isGoogleSignInConfigured && isSyncConfigured ? (
          <Pressable
            style={[styles.googleBtn, busy && styles.googleBtnBusy]}
            onPress={onGoogle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('login.google')}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleText}>{t('login.google')}</Text>
              </>
            )}
          </Pressable>
        ) : (
          <Text style={styles.unconfigured}>{t('login.unconfigured')}</Text>
        )}

        <Text style={styles.note}>{t('login.localNote')}</Text>
      </View>
    </View>
  );
}

// Gate placed on the root layout: reads the flag, opens the login screen full
// screen ONCE if not yet seen. Not rendered at all when accounts are disabled
// (ACCOUNTS_ENABLED=false).
//
// AFTER ONBOARDING: both gates used to open independent Modals with NO ordering
// between them — on a real first launch, both mounted at the same time and the
// login screen ended up ON TOP of onboarding. The result was the user being
// greeted with a "sign in with Google" screen before learning what the app even
// was; and onboarding's last page ("your data stays with you") is exactly what
// gives that decision context, yet it was left behind. Now this gate never
// renders until the onboarding-seen flag has been written.
export function LoginGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not known yet
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'));
  }, []);

  // Onboarding state: the flag is read once; if onboarding is being shown this
  // launch, subscribe to its close event (see Onboarding.onOnboardingDone).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((v) => {
      if (!cancelled) setOnboardingDone(v === '1');
    });
    const unsubscribe = onOnboardingDone(() => {
      if (!cancelled) setOnboardingDone(true);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!ACCOUNTS_ENABLED || seen !== false || onboardingDone !== true) return null;
  const done = () => {
    setSeen(true);
    AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
  };
  return (
    <Modal visible animationType="fade" onRequestClose={done}>
      <LoginScreen onDone={done} canSkip />
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    skip: { position: 'absolute', top: 56, right: 24, zIndex: 1 },
    skipText: { fontSize: 15, fontWeight: '600', color: c.muted },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
    emoji: { fontSize: 64, marginBottom: 24 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
    subtitle: { fontSize: 15, color: c.muted, lineHeight: 23, textAlign: 'center', marginTop: 14 },
    footer: { paddingHorizontal: 24, paddingBottom: 48, gap: 16 },
    error: { fontSize: 13, color: c.danger, textAlign: 'center' },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      height: 52,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    googleBtnBusy: { opacity: 0.6 },
    googleMark: { fontSize: 20, fontWeight: '800', color: c.primary },
    googleText: { fontSize: 16, fontWeight: '700', color: c.text },
    unconfigured: { fontSize: 13, color: c.faint, textAlign: 'center', lineHeight: 19 },
    note: { fontSize: 12, color: c.faint, textAlign: 'center', lineHeight: 18 },
  });
