// Friends screen (modal, opened from the "Friends" row on Profile): the people
// you're connected with, plus ONE "Add a friend" card that holds both halves of
// connecting (share your invite code / enter a friend's code). What friends
// shared with you no longer lives here — it shows up in the Habits and Goals tabs
// (see ui/SharedLists.tsx), like shared tasks do in the Tasks tab.
// The row only shows while signed in; the signed-out branch below is just a
// fallback for a deep link or signing out while this screen is open.
// Connections are online-only by design (see src/sync/friends.ts): the list is
// shown from cache first, then refreshed; every network call is caught here
// because an uncaught rejection would close the app in a release build.

import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  getCachedFriends,
  getInvite,
  getNudgePrefs,
  INVITE_CODE_LENGTH,
  listConnections,
  normalizeInviteCode,
  redeemInvite,
  removeConnection,
  setNudgeMute,
  sharingErrorKey,
  type Friend,
  type Invite,
} from '@/sync';
import { ensurePermission } from '@/lib/notifications';
import { syncPushRegistration } from '@/lib/pushRegistration';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { dateTimeLabel, type Colors } from '@/ui/theme';

function FriendAvatar({ friend, styles }: { friend: Friend; styles: ReturnType<typeof makeStyles> }) {
  const [failed, setFailed] = useState(false);
  if (friend.avatarUrl && !failed) {
    return <Image source={{ uri: friend.avatarUrl }} style={styles.avatar} onError={() => setFailed(true)} />;
  }
  const initial = (friend.displayName ?? '?').trim().charAt(0).toLocaleUpperCase() || '?';
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export default function FriendsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { authUser } = useAppData();
  const signedIn = authUser != null && !authUser.isAnonymous;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [code, setCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);
  // Friend nudges: whom the user muted, and whether this phone can show
  // notifications at all (without it, friends' reminders can't reach them).
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set());
  const [notifOk, setNotifOk] = useState(true);
  // Ignores results that arrive after the screen lost focus / a newer load started.
  const loadSeq = useRef(0);

  const showError = (e: unknown) => Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));

  const refresh = useCallback(() => {
    const seq = ++loadSeq.current;
    let fresh = false;
    getCachedFriends().then((cached) => {
      if (seq === loadSeq.current && !fresh && cached.length > 0) setFriends(cached);
    });
    listConnections()
      .then((list) => {
        fresh = true;
        if (seq !== loadSeq.current) return;
        setFriends(list);
        setListError(null);
      })
      .catch((e) => {
        if (seq === loadSeq.current) setListError(t(sharingErrorKey(e)));
      })
      .finally(() => {
        if (seq === loadSeq.current) setListLoading(false);
      });
    getNudgePrefs()
      .then((prefs) => {
        if (prefs && seq === loadSeq.current) setMuted(new Set(prefs.muted));
      })
      .catch(() => {});
    Notifications.getPermissionsAsync()
      .then((p) => {
        if (seq === loadSeq.current) setNotifOk(p.granted);
      })
      .catch(() => {});
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) refresh();
      return () => {
        loadSeq.current++;
      };
    }, [signedIn, refresh])
  );

  const loadInvite = async (rotate: boolean) => {
    setInviteBusy(true);
    try {
      setInvite(await getInvite(rotate));
    } catch (e) {
      showError(e);
    } finally {
      setInviteBusy(false);
    }
  };

  const shareInvite = () => {
    if (!invite) return;
    Share.share({ message: t('friends.shareMessage', { code: invite.code }) }).catch(() => {});
  };

  const redeem = async () => {
    const normalized = normalizeInviteCode(code);
    if (normalized.length !== INVITE_CODE_LENGTH || redeemBusy) return;
    setRedeemBusy(true);
    try {
      const friend = await redeemInvite(normalized);
      setCode('');
      Alert.alert(
        t('friends.connectedTitle'),
        t('friends.connectedBody', { name: friend.displayName ?? t('friends.unknownName') })
      );
      refresh();
    } catch (e) {
      showError(e);
    } finally {
      setRedeemBusy(false);
    }
  };

  // Optimistic; put back if the server didn't take it.
  const toggleMute = async (friend: Friend) => {
    const next = !muted.has(friend.id);
    const apply = (on: boolean) =>
      setMuted((prev) => {
        const s = new Set(prev);
        if (on) s.add(friend.id);
        else s.delete(friend.id);
        return s;
      });
    apply(next);
    if (!(await setNudgeMute(friend.id, next).catch(() => false))) {
      apply(!next);
      Alert.alert(t('friends.errorTitle'), t('friends.err.ERK_NETWORK'));
    }
  };

  const enableNotifications = async () => {
    const p = await Notifications.getPermissionsAsync().catch(() => null);
    if (p && !p.granted && !p.canAskAgain) {
      Linking.openSettings().catch(() => {});
      return;
    }
    if (await ensurePermission().catch(() => false)) {
      setNotifOk(true);
      syncPushRegistration(authUser?.id ?? null, lang);
    }
  };

  const confirmRemove = (friend: Friend) => {
    const name = friend.displayName ?? t('friends.unknownName');
    Alert.alert(t('friends.removeTitle'), t('friends.removeBody', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeConnection(friend.id);
            setFriends((prev) => prev.filter((f) => f.id !== friend.id));
          } catch (e) {
            showError(e);
          }
        },
      },
    ]);
  };

  if (!signedIn) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('friends.signInRequired')}</Text>
      </View>
    );
  }

  const codeReady = normalizeInviteCode(code).length === INVITE_CODE_LENGTH;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('friends.listTitle')}</Text>
        {listError && <Text style={styles.errText}>{listError}</Text>}
        {friends.length > 0 && !notifOk && (
          <View style={styles.nudgeHint}>
            <Text style={styles.nudgeHintText}>{t('nudge.permissionHint')}</Text>
            <Pressable onPress={enableNotifications} hitSlop={8} accessibilityRole="button">
              <Text style={styles.nudgeHintAction}>{t('nudge.enableNotifications')}</Text>
            </Pressable>
          </View>
        )}
        {friends.length === 0 ? (
          listLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.muted}>{t('friends.empty')}</Text>
          )
        ) : (
          friends.map((f) => {
            const name = f.displayName ?? t('friends.unknownName');
            return (
              <View key={f.id} style={styles.friendRow}>
                <FriendAvatar friend={f} styles={styles} />
                <Text style={styles.friendName} numberOfLines={1}>
                  {name}
                </Text>
                <Pressable
                  onPress={() => toggleMute(f)}
                  hitSlop={8}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !muted.has(f.id) }}
                  accessibilityLabel={t('nudge.fromA11y', { name })}
                >
                  <Feather
                    name={muted.has(f.id) ? 'bell-off' : 'bell'}
                    size={18}
                    color={muted.has(f.id) ? colors.faint : colors.primary}
                  />
                </Pressable>
                <Pressable
                  onPress={() => confirmRemove(f)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.removeA11y', { name })}
                >
                  <Text style={styles.removeText}>{t('friends.remove')}</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      <View style={[styles.card, styles.gap]}>
        <Text style={styles.cardTitle}>{t('friends.addTitle')}</Text>
        <Text style={styles.subTitle}>{t('friends.inviteTitle')}</Text>
        <Text style={styles.hint}>{t('friends.inviteHint')}</Text>
        {invite ? (
          <>
            <Text style={styles.code} selectable accessibilityLabel={invite.code.split('').join(' ')}>
              {invite.code}
            </Text>
            <Text style={styles.expires}>
              {t('friends.inviteExpires', { date: dateTimeLabel(invite.expiresAt, lang) })}
            </Text>
            <View style={styles.row}>
              <Pressable style={[styles.primaryBtn, styles.flex]} onPress={shareInvite} accessibilityRole="button">
                <Text style={styles.primaryBtnText}>{t('friends.inviteShare')}</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineBtn, styles.flex, inviteBusy && styles.disabled]}
                onPress={() => loadInvite(true)}
                disabled={inviteBusy}
                accessibilityRole="button"
              >
                {inviteBusy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.outlineBtnText}>{t('friends.inviteRotate')}</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable
            style={[styles.primaryBtn, inviteBusy && styles.disabled]}
            onPress={() => loadInvite(false)}
            disabled={inviteBusy}
            accessibilityRole="button"
          >
            {inviteBusy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryBtnText}>{t('friends.inviteCreate')}</Text>
            )}
          </Pressable>
        )}
        <View style={styles.divider} />
        <Text style={styles.subTitle}>{t('friends.redeemTitle')}</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(v) => setCode(normalizeInviteCode(v))}
          placeholder="ABCD2345"
          placeholderTextColor={colors.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
          onSubmitEditing={redeem}
          editable={!redeemBusy}
          accessibilityLabel={t('friends.redeemA11y')}
        />
        <Pressable
          style={[styles.primaryBtn, (!codeReady || redeemBusy) && styles.disabled]}
          onPress={redeem}
          disabled={!codeReady || redeemBusy}
          accessibilityRole="button"
        >
          {redeemBusy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.primaryBtnText}>{t('friends.redeemButton')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.bg },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    gap: { marginTop: 16 },
    subTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 6 },
    divider: { height: 1, backgroundColor: c.border, marginVertical: 18 },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 8 },
    hint: { fontSize: 12, color: c.faint, lineHeight: 17, marginBottom: 14 },
    muted: { fontSize: 14, color: c.muted, lineHeight: 20, textAlign: 'center' },
    code: {
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: 6,
      color: c.text,
      textAlign: 'center',
      marginVertical: 6,
    },
    expires: { fontSize: 12, color: c.muted, textAlign: 'center', marginBottom: 14 },
    row: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 4,
      color: c.text,
      textAlign: 'center',
      marginBottom: 12,
    },
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      minHeight: 48,
    },
    primaryBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    outlineBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      minHeight: 48,
    },
    outlineBtnText: { color: c.primary, fontSize: 15, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    errText: { fontSize: 13, color: c.danger, fontWeight: '600', marginBottom: 10 },
    friendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarFallback: { backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { color: c.primary, fontWeight: '800', fontSize: 15 },
    friendName: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
    removeText: { color: c.danger, fontSize: 13, fontWeight: '700' },
    nudgeHint: { backgroundColor: c.primarySoft, borderRadius: 10, padding: 12, gap: 6, marginBottom: 8 },
    nudgeHintText: { fontSize: 13, color: c.text },
    nudgeHintAction: { fontSize: 13, fontWeight: '700', color: c.primary },
  });
