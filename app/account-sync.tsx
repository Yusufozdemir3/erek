// "Account & sync" sub-screen of Profile — Google/e-mail account status, sign-out,
// cloud sync status, and (at the very bottom, deliberately quiet) account deletion.
// Only reachable while ACCOUNTS_ENABLED is on.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { userRepo } from '@/db';
import {
  currentAuthUser,
  currentUid,
  deleteAccountAndData,
  forgetAccountOnDevice,
  isSyncConfigured,
  pendingChangeCount,
  signOutAccount,
  type AuthUser,
} from '@/sync';
import { cancelAllReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { dateTimeLabel } from '@/ui/theme';

export default function AccountSyncScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeProfileStyles(colors);
  // Sync status is kept in AppData, NOT here: most sync runs happen without this
  // screen ever opening (startup + foregrounding). Keeping a local copy would
  // have hidden the result of those automatic runs — that was exactly the bug
  // that got fixed.
  const {
    user,
    refreshUser,
    refreshAuthUser,
    notifyDataChanged,
    syncResult,
    lastSyncAt,
    syncing,
    syncNow,
    clearSyncStatus,
  } = useAppData();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Is the account linked to an email? (an anonymous session doesn't count as "linked")
  const linked = authUser != null && !authUser.isAnonymous && authUser.email != null;

  useFocusEffect(
    useCallback(() => {
      currentUid().then((uid) => setSignedIn(uid !== null));
      currentAuthUser().then(setAuthUser);
    }, [])
  );

  // The only question sign-out may ask: a REAL data-loss warning, shown only
  // when some local changes never reached the cloud. Resolves true = sign out anyway.
  const confirmUnsyncedSignOut = (n: number): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        t('profile.signOutUnsyncedTitle'),
        t('profile.signOutUnsyncedBody', { n }),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('profile.signOutAnyway'), style: 'destructive', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });

  // SIGN-OUT — data belongs to the account (see the "DATA BELONGS TO THE
  // ACCOUNT" note in sync/syncEngine.ts). It used to ask "erase the data on
  // this device too?" after every sign-out — a technical question users
  // shouldn't have to answer. Now:
  //   1) back up whatever is pending (a last sync round),
  //   2) only if something STILL didn't make it (offline, server error) warn
  //      once, with the count,
  //   3) sign out and let the device forget the account's data; signing back
  //      in brings it all back from the cloud.
  // This also covers the shared-device concern the old prompt was for.
  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await syncNow(); // best effort — pendingChangeCount() below is what decides
      const pending = pendingChangeCount();
      if (pending > 0 && !(await confirmUnsyncedSignOut(pending))) return;
      await signOutAccount();
      await forgetAccountOnDevice();
      // The forgotten habits/tasks/goals' triggers are still in the OS queue.
      await cancelAllReminders();
      userRepo.downgradeToLocal(user.id);
      clearSyncStatus();
      notifyDataChanged();
      refreshUser();
      refreshAuthUser();
      setAuthUser(null);
      setSignedIn(false);
    } catch (e) {
      // Used to be swallowed into console.warn — the user believed they were
      // signed out while the session was still there.
      Alert.alert(t('profile.signOutFailedTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOut(false);
    }
  };

  // Account deletion: irreversible — two-step with a native confirmation dialog.
  // The cloud account plus all cloud data is deleted; ON-DEVICE data remains and
  // the user continues without an account (unlike sign-out, which forgets the
  // data on the device because it still lives in the account).
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
      refreshAuthUser();
      setAuthUser(null);
      setSignedIn(false);
      clearSyncStatus();
      // No follow-up question: the account is gone, the data stays on this
      // device and the app simply continues without an account.
      Alert.alert(t('profile.deletedTitle'), t('profile.deletedBody'));
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
            <Text style={styles.hint}>{t('profile.signOutHint')}</Text>
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

      {/* Account deletion: irreversible, so it's a small quiet link at the very
          bottom instead of a button next to "Sign out". */}
      {linked && (
        <>
          <Pressable
            style={styles.deleteLink}
            onPress={confirmDeleteAccount}
            disabled={deleting || signingOut}
            accessibilityRole="button"
            accessibilityLabel={t('profile.deleteAccount')}
          >
            {deleting ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={styles.deleteLinkText}>{t('profile.deleteAccount')}</Text>
            )}
          </Pressable>
          <Text style={styles.deleteHint}>{t('profile.deleteAccountHint')}</Text>
        </>
      )}

      <Text style={styles.footnote}>{t('profile.footnoteSynced')}</Text>
    </ScrollView>
  );
}
