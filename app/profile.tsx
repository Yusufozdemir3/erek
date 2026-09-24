// Profile screen (modal) — appearance (theme) + account linking + cloud sync status.
// Content that used to live in the old "Settings" tab; once that tab was removed,
// it moved into the modal opened from the 👤 icon in screen headers. The header
// title comes from the root layout's native header.
// If sync isn't configured (.env empty), it explains how to set it up.

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { userRepo } from '@/db';
import { Feather } from '@expo/vector-icons';
import {
  clearLocalData,
  currentAuthUser,
  currentUid,
  deleteAccountAndData,
  isSyncConfigured,
  signOutAccount,
  type AuthUser,
} from '@/sync';
import { isHapticsEnabled, setHapticsEnabled, tapLight } from '@/lib/haptics';
import { useAppData } from '@/ui/AppData';
import { useTheme, type ThemeMode } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { LANG_LABELS, SUPPORTED_LANGS } from '@/i18n/translations';
import { ACCENT_ORDER, ACCENT_THEMES, dateTimeLabel, type Colors } from '@/ui/theme';
import { ACCOUNTS_ENABLED } from '@/config';

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'light', labelKey: 'profile.themeLight' },
  { mode: 'dark', labelKey: 'profile.themeDark' },
  { mode: 'system', labelKey: 'profile.themeSystem' },
];

export default function ProfileScreen() {
  const { colors, scheme, mode, setMode, accent, setAccent, darkStyle, setDarkStyle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const styles = makeStyles(colors);
  // Sync status is kept in AppData, NOT here: most sync runs happen without this
  // screen ever opening (startup + foregrounding). Keeping a local copy would
  // have hidden the result of those automatic runs — that was exactly the bug
  // that got fixed.
  const { user, refreshUser, hideCompleted, setHideCompleted, syncResult, lastSyncAt, syncing, syncNow } =
    useAppData();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Haptics preference; the cache is loaded at startup (see _layout), so the
  // initial value here is correct right away.
  const [haptics, setHaptics] = useState(isHapticsEnabled);

  // Toggle haptics on/off — turning it off silences touches immediately (cache
  // is written first).
  const toggleHaptics = (value: boolean) => {
    setHaptics(value);
    setHapticsEnabled(value).catch(() => {});
    if (value) tapLight(); // one sample buzz when turning it on so the user feels what they just enabled
  };

  // Is the account linked to an email? (an anonymous session doesn't count as "linked")
  const linked = authUser != null && !authUser.isAnonymous && authUser.email != null;

  useFocusEffect(
    useCallback(() => {
      currentUid().then((uid) => setSignedIn(uid !== null));
      currentAuthUser().then(setAuthUser);
    }, [])
  );

  // Shared/handed-off device concern: signing out (or deleting the account)
  // leaves all local SQLite data readable to whoever opens the app next -
  // there's no PIN/biometric lock. Offer an explicit, opt-in way to wipe it.
  const promptEraseLocalData = () => {
    Alert.alert(t('profile.eraseDataTitle'), t('profile.eraseDataBody'), [
      { text: t('profile.eraseDataKeep'), style: 'cancel' },
      {
        text: t('profile.eraseDataConfirm'),
        style: 'destructive',
        onPress: async () => {
          await clearLocalData();
          refreshUser();
          Alert.alert(t('profile.eraseDataDoneTitle'), t('profile.eraseDataDoneBody'));
        },
      },
    ]);
  };

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutAccount();
      userRepo.downgradeToLocal(user.id);
      refreshUser();
      setAuthUser(null);
      setSignedIn(false);
      promptEraseLocalData();
    } catch (e) {
      // A sign-out error isn't critical; the status refreshes on the next focus.
      console.warn('[Account] Error during sign-out:', e);
    } finally {
      setSigningOut(false);
    }
  };

  // Account deletion: irreversible — two-step with a native confirmation dialog.
  // The cloud account plus all cloud data is deleted; ON-DEVICE data remains and
  // the user falls back to anonymous/local mode (same local end state as signing out).
  const confirmDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.deletePermanently'), style: 'destructive', onPress: doDeleteAccount },
      ]
    );
  };

  const doDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccountAndData();
      userRepo.downgradeToLocal(user.id);
      refreshUser();
      setAuthUser(null);
      setSignedIn(false);
      Alert.alert(t('profile.deletedTitle'), t('profile.deletedBody'), [
        { text: t('common.ok'), onPress: promptEraseLocalData },
      ]);
    } catch (e) {
      Alert.alert(t('profile.deleteFailedTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const doSync = async () => {
    await syncNow();
    const uid = await currentUid();
    setSignedIn(uid !== null);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Appearance (theme) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.appearance')}</Text>
        <View style={styles.segRow}>
          {THEME_OPTIONS.map((opt) => {
            const on = mode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setMode(opt.mode)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('profile.systemHint')}</Text>

        {/* Dark theme style — warm ink / true black (AMOLED). Stays selectable
            in light theme too; it takes effect once dark theme is active. */}
        <Text style={styles.subCardTitle}>{t('profile.darkStyle')}</Text>
        <View style={styles.segRow}>
          {(
            [
              { style: 'warm', labelKey: 'profile.darkWarm' },
              { style: 'black', labelKey: 'profile.darkBlack' },
            ] as { style: 'warm' | 'black'; labelKey: string }[]
          ).map((opt) => {
            const on = darkStyle === opt.style;
            return (
              <Pressable
                key={opt.style}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setDarkStyle(opt.style)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Accent (brand) color */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.accentColor')}</Text>
        <View style={styles.accentRow}>
          {ACCENT_ORDER.map((key) => {
            const on = accent === key;
            const swatch = ACCENT_THEMES[key][scheme].primary;
            return (
              <Pressable
                key={key}
                style={styles.accentItem}
                onPress={() => setAccent(key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`profile.accent.${key}`)}
              >
                <View
                  style={[styles.accentSwatch, { backgroundColor: swatch }, on && styles.accentSwatchOn]}
                >
                  {on && <Text style={styles.accentCheck}>✓</Text>}
                </View>
                <Text style={styles.accentLabel}>{t(`profile.accent.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Language */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.language')}</Text>
        <View style={styles.segRow}>
          {SUPPORTED_LANGS.map((l) => {
            const on = lang === l;
            return (
              <Pressable
                key={l}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setLang(l)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{LANG_LABELS[l]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Today screen preferences */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.todayScreen')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('today.hideCompleted')}</Text>
          <Switch
            value={hideCompleted}
            onValueChange={setHideCompleted}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hideCompletedHint')}</Text>
      </View>

      {/* Haptics (in-app tactile feedback) — SEPARATE from notification vibration:
          this is the feedback you feel on touches like checking off/+−/timer. */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.haptics')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('profile.hapticsEnabled')}</Text>
          <Switch
            value={haptics}
            onValueChange={toggleHaptics}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hapticsHint')}</Text>
      </View>

      {/* Notifications — content lives on its own page now (grew once sound/
          vibration got separate controls). Tapping the arrow row opens it. */}
      <Pressable
        style={[styles.card, styles.navRow, { marginTop: 16 }]}
        onPress={() => router.push('/notifications')}
        accessibilityRole="button"
        accessibilityLabel={t('profile.notifications')}
      >
        <Text style={[styles.cardTitle, { marginBottom: 0 }]}>{t('profile.notifications')}</Text>
        <Feather name="chevron-right" size={20} color={colors.faint} />
      </Pressable>

      {/* Account + Cloud sync — hidden in the closed test (MVP) build.
          Will be set to ACCOUNTS_ENABLED = true once password reset ships. */}
      {ACCOUNTS_ENABLED && (
        <>
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.account')}</Text>

        {!isSyncConfigured ? (
          <Text style={styles.muted}>{t('profile.syncNotConfigured')}</Text>
        ) : linked ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>{t('profile.linkedAccount')}</Text>
              <Text style={styles.statusValue}>{authUser!.email}</Text>
            </View>
            <Pressable
              style={[styles.outlineBtn, signingOut && styles.syncBtnDisabled]}
              onPress={doSignOut}
              disabled={signingOut || deleting}
              accessibilityRole="button"
              accessibilityLabel={t('profile.signOut')}
            >
              {signingOut ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.outlineBtnText}>{t('profile.signOut')}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.dangerBtn, deleting && styles.syncBtnDisabled]}
              onPress={confirmDeleteAccount}
              disabled={deleting || signingOut}
              accessibilityRole="button"
              accessibilityLabel={t('profile.deleteAccount')}
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} />
              ) : (
                <Text style={styles.dangerBtnText}>{t('profile.deleteAccount')}</Text>
              )}
            </Pressable>
            <Text style={styles.hint}>{t('profile.deleteAccountHint')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.muted}>{t('profile.notLinkedBody')}</Text>
            {/* Sign-in is now GOOGLE-ONLY (see ui/LoginScreen.tsx). This is the
                sign-in path for a user who skipped the opening gate with "Skip
                for now". The email+password screen (/account) wasn't deleted,
                it's just unlinked. */}
            <Pressable
              style={styles.syncBtn}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel={t('login.openA11y')}
            >
              <Text style={styles.syncBtnText}>{t('login.google')}</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.cloudSync')}</Text>

        {!isSyncConfigured ? (
          <Text style={styles.muted}>{t('profile.syncNotConfiguredBody')}</Text>
        ) : (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.muted}>{t('profile.syncStatus')}</Text>
              <Text style={styles.statusValue}>
                {signedIn
                  ? linked
                    ? t('profile.syncConnectedAccount')
                    : t('profile.syncConnectedAnon')
                  : t('profile.syncNotConnected')}
              </Text>
            </View>

            {/* LAST BACKUP — the one signal that's genuinely meaningful to the
                user: "how stale is my cloud copy?". It survives app restarts
                (see AppData.LAST_SYNC_KEY). The ↑/↓ counts are only that run's
                detail; this line is the status itself. */}
            {signedIn && (
              <View style={[styles.statusRow, styles.statusRowSpaced]}>
                <Text style={styles.muted}>{t('profile.lastBackup')}</Text>
                <Text style={styles.statusValue}>
                  {lastSyncAt != null ? dateTimeLabel(new Date(lastSyncAt).toISOString(), lang) : t('profile.lastBackupNever')}
                </Text>
              </View>
            )}

            {syncResult?.status === 'ok' && (
              <Text style={styles.okText}>
                {t('profile.lastSync', {
                  pushed: syncResult.pushed ?? 0,
                  pulled: syncResult.pulled ?? 0,
                })}
              </Text>
            )}
            {/* The error is now PERSISTENT: an error from an automatic run at
                startup or when foregrounding lands here too (it used to go
                nowhere). Ownership conflicts get their own readable message —
                the raw Postgres message tells the user nothing. */}
            {syncResult?.status === 'error' && (
              <Text style={styles.errText}>
                {syncResult.ownershipConflict
                  ? t('sync.ownershipConflict')
                  : t('profile.syncError', { message: syncResult.message ?? '' })}
              </Text>
            )}
            {syncResult?.status === 'disabled' && (
              <Text style={[styles.muted, { marginTop: 12 }]}>{t('profile.syncDisabled')}</Text>
            )}

            <Pressable
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={doSync}
              disabled={syncing}
              accessibilityRole="button"
              accessibilityLabel={t('profile.syncNow')}
            >
              {syncing ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.syncBtnText}>{t('profile.syncNow')}</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
        </>
      )}

      <Text style={styles.footnote}>
        {ACCOUNTS_ENABLED ? t('profile.footnoteSynced') : t('profile.footnoteLocal')}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 12 },
    // Arrow row that navigates to another page (e.g. Notifications). We reset
    // cardTitle's bottom margin inline so the title stays vertically centered.
    navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    // Secondary in-card heading (e.g. "Dark theme style" inside the Appearance card).
    subCardTitle: { fontSize: 13, fontWeight: '700', color: c.muted, marginTop: 16, marginBottom: 10 },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20 },
    hint: { fontSize: 12, color: c.faint, marginTop: 10 },
    code: { fontWeight: '700', color: c.text },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusRowSpaced: { marginTop: 10 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchRowSpaced: { marginTop: 12 },
    switchLabel: { fontSize: 14, color: c.text, flex: 1, marginRight: 12 },
    rowDisabled: { opacity: 0.4 },
    statusValue: { fontSize: 14, fontWeight: '700', color: c.text },
    okText: { fontSize: 13, color: c.done, fontWeight: '600', marginTop: 12 },
    errText: { fontSize: 13, color: c.danger, fontWeight: '600', marginTop: 12 },
    // Theme selector segment.
    segRow: { flexDirection: 'row', gap: 8 },
    segBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    segBtnOn: { backgroundColor: c.primary, borderColor: c.primary },
    segText: { fontSize: 14, fontWeight: '700', color: c.muted },
    segTextOn: { color: c.onAccent },
    // Accent color picker — colored circles with a short name underneath.
    accentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    accentItem: { alignItems: 'center', width: 64 },
    accentSwatch: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    accentSwatchOn: { borderWidth: 3, borderColor: c.text },
    accentCheck: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
    accentLabel: { fontSize: 11, fontWeight: '600', color: c.muted, marginTop: 6, textAlign: 'center' },
    syncBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 16,
      minHeight: 50,
    },
    syncBtnDisabled: { opacity: 0.6 },
    syncBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    outlineBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 16,
      minHeight: 50,
    },
    outlineBtnText: { color: c.primary, fontSize: 15, fontWeight: '700' },
    dangerBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      marginTop: 10,
      minHeight: 50,
    },
    dangerBtnText: { color: c.danger, fontSize: 15, fontWeight: '700' },
    footnote: { fontSize: 12, color: c.faint, lineHeight: 18, marginTop: 20 },
  });
