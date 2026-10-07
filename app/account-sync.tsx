// Profile › Account & sync: the account, sign-out, sync status and — quietly,
// at the bottom — account deletion.

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
  // From AppData, so automatic rounds show here too.
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

  const linked = authUser != null && !authUser.isAnonymous && authUser.email != null;

  useFocusEffect(
    useCallback(() => {
      currentUid().then((uid) => setSignedIn(uid !== null));
      currentAuthUser().then(setAuthUser);
    }, [])
  );

  // Sign-out's only question: changes that never reached the cloud. true = sign out anyway.
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

  // Sign-out: a last sync, a warning only if something still didn't make it,
  // then the device forgets the account's data (signing in brings it back).
  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await syncNow(); // best effort; pendingChangeCount() decides
      const pending = pendingChangeCount();
      if (pending > 0 && !(await confirmUnsyncedSignOut(pending))) return;
      await signOutAccount();
      await forgetAccountOnDevice();
      // The forgotten items' triggers are still queued.
      await cancelAllReminders();
      userRepo.downgradeToLocal(user.id);
      clearSyncStatus();
      notifyDataChanged();
      refreshUser();
      refreshAuthUser();
      setAuthUser(null);
      setSignedIn(false);
    } catch (e) {
      // Tell the user: the session may still be there.
      Alert.alert(t('profile.signOutFailedTitle'), e instanceof Error ? e.message : String(e));
    } finally {
      setSigningOut(false);
    }
  };

  // Irreversible, so confirmed. The cloud account and data go; the device keeps
  // its data and continues without an account (sign-out does the opposite).
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
            {/* Google sign-in for someone who skipped it at first launch. */}
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

            {/* "How old is my backup?" — survives restarts. */}
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
            {/* Errors of automatic rounds too; an ownership conflict gets a readable message. */}
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

      {/* Irreversible, so a quiet link at the bottom. */}
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
