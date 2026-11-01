// On a friend's shared habit: "Join" makes it a shared habit (src/sync/habitGroups.ts).
// The server opens our copy; a sync pulls it, then its own page opens. Once
// joined, the button leads to our copy instead.

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { habitRepo } from '@/db';
import { joinHabitGroup, sharingErrorKey } from '@/sync';
import { todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { useAppData } from '@/ui/AppData';
import { refreshGroups, useHabitGroups } from '@/ui/useHabitGroups';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

// `compact`: the button alone (no explanation), for the shared habit's list card.
export function JoinGroupButton({
  habitId,
  title,
  compact,
  together = true,
}: {
  habitId: string;
  title: string;
  compact?: boolean;
  // false: the owner shared it "just to watch", joining is closed.
  together?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { syncNow, notifyDataChanged } = useAppData();
  const { groups } = useHabitGroups();
  const [busy, setBusy] = useState(false);
  const myCopy = groups
    .find((g) => g.groupId === habitId)
    ?.members.find((m) => m.isMe && !m.isOwner)?.habitId;

  // From the list card there's no page of ours to replace (replace would swap out the tabs and leave
  // nothing to go back to); from the shared habit's own page, replace it so back skips the stale page.
  const openCopy = (id: string) => {
    const target = { pathname: '/habit/[id]', params: { id } } as const;
    if (compact) router.push(target);
    else router.replace(target);
  };

  const join = async () => {
    setBusy(true);
    try {
      const copyId = await joinHabitGroup(habitId, todayDate());
      await syncNow();
      await refreshGroups(true);
      notifyDataChanged();
      notifySuccess();
      if (habitRepo.getById(copyId)) openCopy(copyId);
      else Alert.alert(t('group.joinedTitle'), t('group.joinedLater'));
    } catch (e) {
      Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const confirmJoin = () => {
    tapLight();
    Alert.alert(t('group.joinTitle'), t('group.joinBody', { title }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('group.join'), onPress: join },
    ]);
  };

  if (myCopy && habitRepo.getById(myCopy)) {
    return (
      <Pressable style={styles.btn} onPress={() => openCopy(myCopy)} accessibilityRole="button">
        <Feather name="users" size={16} color={colors.primary} />
        <Text style={styles.text}>{t('group.openMine')}</Text>
      </Pressable>
    );
  }

  if (!together) return compact ? null : <Text style={[styles.note, styles.viewOnly]}>{t('group.viewOnly')}</Text>;

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <Pressable
        style={[styles.btn, styles.btnPrimary, busy && styles.busy]}
        onPress={confirmJoin}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <Feather name="user-plus" size={16} color={colors.onAccent} />
        )}
        <Text style={[styles.text, styles.textPrimary]}>{t('group.join')}</Text>
      </Pressable>
      {!compact && <Text style={styles.note}>{t('group.joinHint')}</Text>}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
    },
    wrapCompact: { flex: 1 },
    btnPrimary: { marginTop: 0, alignSelf: 'stretch', backgroundColor: c.primary },
    busy: { opacity: 0.6 },
    text: { fontSize: 14, fontWeight: '700', color: c.primary },
    textPrimary: { color: c.onAccent },
    viewOnly: { marginTop: 12 },
    note: { fontSize: 12, color: c.muted, lineHeight: 17 },
  });
