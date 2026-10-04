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
import { announceGatesClosed } from '@/lib/guides';
import { LOGIN_SEEN_KEY, onOnboardingDone, ONBOARDING_SEEN_KEY } from '@/ui/Onboarding';
import { useGoogleSignIn } from '@/ui/useGoogleSignIn';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = LOGIN_SEEN_KEY;

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
  const { available, busy, error, signIn: onGoogle } = useGoogleSignIn(onDone);

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
        {available ? (
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
    // The wizard's account page may already have covered sign-in (and wrote the
    // flag just before this event): re-read it instead of trusting the value
    // read at startup.
    const unsubscribe = onOnboardingDone(() => {
      AsyncStorage.getItem(SEEN_KEY)
        .then((v) => {
          if (cancelled) return;
          setSeen(v === '1');
          setOnboardingDone(true);
        })
        .catch(() => {
          if (!cancelled) setOnboardingDone(true);
        });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!ACCOUNTS_ENABLED || seen !== false || onboardingDone !== true) return null;
  const done = () => {
    setSeen(true);
    // The feature guides wait for this screen to be gone (lib/guides.ts).
    AsyncStorage.setItem(SEEN_KEY, '1')
      .catch(() => {})
      .then(announceGatesClosed);
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
