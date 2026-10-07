// Login screen — Google only. Used in two places:
//   - LoginGate: full screen once on first launch, skippable (the app works
//     fully without an account);
//   - app/login.tsx: opened from Profile later (no skip button there).

import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { ACCOUNTS_ENABLED } from '@/config';
import { LineIcon } from '@/ui/LineIcon';
import { announceGatesClosed } from '@/lib/guides';
import { LOGIN_SEEN_KEY, onOnboardingDone, ONBOARDING_SEEN_KEY } from '@/ui/Onboarding';
import { useGoogleSignIn } from '@/ui/useGoogleSignIn';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = LOGIN_SEEN_KEY;

export interface LoginScreenProps {
  /** Signed in or skipped; the caller closes the screen. */
  onDone: () => void;
  /** Show "skip for now" (the launch gate only). */
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
        <View style={styles.badge}>
          <LineIcon id="cloud" size={52} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.footer}>
        {error != null && <Text style={styles.error}>{error}</Text>}

        {/* Unconfigured (dev builds): say why instead of a button that always fails. */}
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

// Shows the login screen once, full screen, and only AFTER the setup wizard —
// two full-screen layers must never stack, and the wizard explains why to sign in.
export function LoginGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not read yet
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'));
  }, []);

  // If the wizard is showing this launch, wait for it to close.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY).then((v) => {
      if (!cancelled) setOnboardingDone(v === '1');
    });
    // The wizard's account step may have written the flag meanwhile: re-read it.
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
    badge: {
      width: 116,
      height: 116,
      borderRadius: 58,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
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
