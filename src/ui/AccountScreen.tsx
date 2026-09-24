// Account-linking screen via email + password. CURRENTLY UNUSED and NOT a
// ROUTE — deliberately kept outside app/ (used to be app/account.tsx).
//
// WHY IT WAS MOVED: sign-in is Google-only now (see ui/LoginScreen.tsx) and
// nothing linked to this screen anymore. But as long as it stayed under app/
// the route was still live: it could be opened with `habitapp://account`, and
// that had three problems —
// (1) a SECOND account could be opened via email+password, circumventing the
//     "Google only" decision;
// (2) sync was run directly via runSync (bypassing AppData.syncNow), so the
//     "last backup" timestamp and sync error state never got updated;
// (3) there was no account-switch check (classifySignIn / merge-or-switch),
//     so the RLS lockout that was fixed elsewhere could be reproduced here.
//
// IF RE-ENABLING: first align the three issues above with the flow in
// LoginScreen; moving the file back under app/ ALONE is not enough.
//
// The original note below (the flow itself) is kept as-is:
//
// Flow:
//   - Sign in / Sign up (segment at the top; email + password, Supabase auth).
//   - "Forgot password": an IN-APP code flow — a 6-digit code is emailed
//     (must be {{ .Token }} in the Supabase template), and once the code +
//     new password are entered, verifyOtp signs in and updates the password
//     (see sync/auth.ts).
//   - Once signed in, the local anonymous user is UPGRADED to an account
//     (email is set), all local data is marked for resending
//     (prepareFullResync), and a full sync round runs.
//   - The sync result (↑pushed / ↓pulled) is shown on screen.

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { userRepo } from '@/db';
import {
  currentAuthUser,
  isSyncConfigured,
  linkEmailToAnonymous,
  prepareFullResync,
  requestPasswordReset,
  resetPasswordWithCode,
  runSync,
  signInWithEmail,
  signUpWithEmail,
  type SyncResult,
} from '@/sync';
import { translateAuthError } from '@/lib/authErrors';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { type Colors } from '@/ui/theme';

type Mode = 'signin' | 'signup' | 'forgot';

export default function AccountScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user, refreshUser } = useAppData();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Password reset: whether the code was requested (moved to step 2) + code + new password.
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [done, setDone] = useState(false);

  const clearMessages = () => {
    setError(null);
    setInfo(null);
  };

  // After signing in: upgrade the local user to an account + full resync.
  const linkAndSync = async () => {
    userRepo.upgradeToAccount(user.id, email.trim());
    await prepareFullResync();
    const r = await runSync(user.id);
    refreshUser();
    setResult(r);
    return r;
  };

  const finishSignedIn = async () => {
    const r = await linkAndSync();
    if (r.status === 'error') {
      setError(t('account.syncFailedAfterLogin', { message: r.message ?? '' }));
    } else {
      setInfo(t('account.linkedAndSynced'));
      setDone(true);
    }
  };

  const onSubmit = async () => {
    clearMessages();
    setResult(null);
    const em = email.trim();
    if (!em || !password) {
      setError(t('account.errRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('account.errPasswordShort'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        // If we're currently in an anonymous session (the app starts anonymous
        // on launch), CONVERT the account via updateUser: the same uid is kept
        // → the owner of the cloud data doesn't change, no RLS conflict. If
        // there's no anonymous session, do a normal signUp.
        const cur = await currentAuthUser();
        if (cur?.isAnonymous) {
          await linkEmailToAnonymous(em, password);
        } else {
          const { needsConfirmation } = await signUpWithEmail(em, password);
          if (needsConfirmation) {
            setInfo(t('account.confirmationSent'));
            setMode('signin');
            return;
          }
        }
      } else {
        await signInWithEmail(em, password);
      }
      // If we got here, there's an active session.
      await finishSignedIn();
    } catch (e) {
      setError(translateAuthError(e, t));
    } finally {
      setBusy(false);
    }
  };

  // Password reset — step 1: send a code to the email.
  const onSendResetCode = async () => {
    clearMessages();
    const em = email.trim();
    if (!em) {
      setError(t('account.errRequired'));
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(em);
      setResetCodeSent(true);
      setInfo(t('account.resetSent'));
    } catch (e) {
      setError(translateAuthError(e, t));
    } finally {
      setBusy(false);
    }
  };

  // Password reset — step 2: code + new password. On success a session is
  // opened; continues into the same linkAndSync flow as normal sign-in.
  const onResetPassword = async () => {
    clearMessages();
    const em = email.trim();
    if (!em || !resetCode.trim() || !password) {
      setError(t('account.errRequired'));
      return;
    }
    if (password.length < 6) {
      setError(t('account.errPasswordShort'));
      return;
    }
    setBusy(true);
    try {
      await resetPasswordWithCode(em, resetCode, password);
      await finishSignedIn();
    } catch (e) {
      setError(translateAuthError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    clearMessages();
    setResetCodeSent(false);
    setResetCode('');
    setPassword('');
  };

  if (!isSyncConfigured) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>{t('account.notConfigTitle')}</Text>
        <Text style={styles.centerBody}>{t('account.notConfigBody')}</Text>
      </View>
    );
  }

  const isForgot = mode === 'forgot';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Top identity: cloud icon + title + short description */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name={isForgot ? 'key' : 'cloud'} size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>
            {isForgot
              ? t('account.resetTitle')
              : mode === 'signin'
                ? t('account.titleSignin')
                : t('account.titleSignup')}
          </Text>
          <Text style={styles.subtitle}>
            {isForgot ? t('account.resetSubtitle') : t('account.subtitle')}
          </Text>
        </View>

        {done ? (
          <View style={styles.card}>
            <View style={styles.successRow}>
              <Feather name="check-circle" size={22} color={colors.done} />
              <Text style={styles.successTitle}>{t('account.linkedTitle')}</Text>
            </View>
            {result?.status === 'ok' && (
              <Text style={styles.syncLine}>
                {t('account.syncLine', { pushed: result.pushed ?? 0, pulled: result.pulled ?? 0 })}
              </Text>
            )}
            <Text style={styles.muted}>{t('account.linkedAs', { email: email.trim() })}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>{t('account.done')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            {/* Sign in / Sign up segment (hidden during password reset) */}
            {!isForgot && (
              <View style={styles.segRow}>
                {(['signin', 'signup'] as Mode[]).map((m) => {
                  const on = mode === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.segBtn, on && styles.segBtnOn]}
                      onPress={() => switchMode(m)}
                      disabled={busy}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.segText, on && styles.segTextOn]}>
                        {t(m === 'signin' ? 'account.signIn' : 'account.signUp')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Email */}
            <Text style={styles.label}>{t('account.email')}</Text>
            <View style={styles.inputRow}>
              <Feather name="mail" size={16} color={colors.faint} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder={t('account.emailPlaceholder')}
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!busy && !(isForgot && resetCodeSent)}
              />
            </View>

            {/* Password reset step 2: the code from the email */}
            {isForgot && resetCodeSent && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>{t('account.resetCode')}</Text>
                <View style={styles.inputRow}>
                  <Feather name="hash" size={16} color={colors.faint} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder={t('account.resetCodePlaceholder')}
                    placeholderTextColor={colors.faint}
                    keyboardType="number-pad"
                    editable={!busy}
                  />
                </View>
              </>
            )}

            {/* Password (only in step 2 during reset: new password) */}
            {(!isForgot || resetCodeSent) && (
              <>
                <Text style={[styles.label, { marginTop: 14 }]}>
                  {t(isForgot ? 'account.newPassword' : 'account.password')}
                </Text>
                <View style={styles.inputRow}>
                  <Feather name="lock" size={16} color={colors.faint} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('account.passwordPlaceholder')}
                    placeholderTextColor={colors.faint}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!busy}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t(showPassword ? 'account.hidePasswordA11y' : 'account.showPasswordA11y')}
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={17} color={colors.faint} />
                  </Pressable>
                </View>
              </>
            )}

            {error && <Text style={styles.errText}>{error}</Text>}
            {info && <Text style={styles.infoText}>{info}</Text>}

            {/* Main action */}
            <Pressable
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={isForgot ? (resetCodeSent ? onResetPassword : onSendResetCode) : onSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isForgot
                    ? t(resetCodeSent ? 'account.resetSubmit' : 'account.resetSendCode')
                    : t(mode === 'signin' ? 'account.signIn' : 'account.signUp')}
                </Text>
              )}
            </Pressable>

            {/* Bottom links */}
            {mode === 'signin' && (
              <Pressable style={styles.switchBtn} onPress={() => switchMode('forgot')} disabled={busy}>
                <Text style={styles.switchText}>{t('account.forgot')}</Text>
              </Pressable>
            )}
            {isForgot && (
              <Pressable style={styles.switchBtn} onPress={() => switchMode('signin')} disabled={busy}>
                <Text style={styles.switchText}>{t('account.backToSignin')}</Text>
              </Pressable>
            )}
          </View>
        )}

        <Text style={styles.footnote}>{t('account.footnote')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 48 },

    hero: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
    heroIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    title: { fontSize: 24, fontWeight: '800', color: c.text, textAlign: 'center' },
    subtitle: {
      fontSize: 14,
      color: c.muted,
      lineHeight: 20,
      marginTop: 6,
      textAlign: 'center',
      maxWidth: 320,
    },

    card: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },

    segRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    segBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    segBtnOn: { backgroundColor: c.primary, borderColor: c.primary },
    segText: { fontSize: 14, fontWeight: '700', color: c.muted },
    segTextOn: { color: c.onAccent },

    label: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 6 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
    },
    inputIcon: { marginRight: 8 },
    input: { flex: 1, paddingVertical: 12, fontSize: 15, color: c.text },

    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 18,
      minHeight: 50,
    },
    btnDisabled: { opacity: 0.6 },
    primaryBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    switchBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
    switchText: { color: c.primary, fontSize: 14, fontWeight: '600' },
    errText: { fontSize: 13, color: c.danger, fontWeight: '600', marginTop: 14 },
    infoText: { fontSize: 13, color: c.primary, fontWeight: '600', marginTop: 14 },
    successRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    successTitle: { fontSize: 18, fontWeight: '800', color: c.done },
    syncLine: { fontSize: 14, color: c.text, fontWeight: '600', marginBottom: 8 },
    muted: { fontSize: 14, color: c.muted },
    footnote: { fontSize: 12, color: c.faint, lineHeight: 18, marginTop: 20 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.bg },
    centerTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 8, textAlign: 'center' },
    centerBody: { fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' },
  });
