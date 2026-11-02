// "Share with friends" card on the owner's habit stats screen: the friend sees
// the habit's full history, read-only (see src/sync/sharedHabits.ts). Every friend
// is shared in ONE of two modes: "just watch" or "do it together" (they may join).
// The switch picks which mode the chips below edit: a friend shows ticked only under
// the mode they are in, and tapping them under the other one moves them over.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Habit } from '@/db';
import { listHabitShareModes, listHabitShares, sendHabitInvite, setHabitShareMode, shareHabit, unshareHabit } from '@/sync';
import { tapLight } from '@/lib/haptics';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { ShareWithFriendsSection } from '@/ui/ShareWithFriendsSection';
import type { Colors } from '@/ui/theme';

export function HabitShareSection({ habit }: { habit: Habit }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [together, setTogether] = useState(false);

  const pick = (value: boolean) => {
    if (value === together) return;
    tapLight();
    setTogether(value);
  };

  // Moving a friend to "together" invites them (once each).
  const assign = async (id: string, friendId: string, value: boolean) => {
    await setHabitShareMode(id, value, friendId);
    if (value) sendHabitInvite(id).catch(() => {});
  };

  const options = [
    { value: false, label: t('group.modeView') },
    { value: true, label: t('group.modeTogether') },
  ];

  return (
    <ShareWithFriendsSection
      entityId={habit.id}
      hint={t(together ? 'group.modeTogetherHint' : 'group.modeViewHint')}
      listShares={listHabitShares}
      share={shareHabit}
      unshare={unshareHabit}
      notSyncedCode="ERK_HABIT_NOT_SYNCED"
      modes={{ active: together, load: listHabitShareModes, assign }}
      header={
        <View style={styles.seg} accessibilityRole="radiogroup">
          {options.map((o) => (
            <Pressable
              key={String(o.value)}
              style={[styles.segItem, together === o.value && styles.segOn]}
              onPress={() => pick(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: together === o.value }}
            >
              <Text style={[styles.segText, together === o.value && styles.segTextOn]}>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      }
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // Selected = tinted fill + accent border (the friend chips below are SOLID accent, so the
    // two never read as the same kind of "on").
    seg: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    segItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: 'transparent',
    },
    segOn: { backgroundColor: c.primarySoft, borderColor: c.primary },
    segText: { fontSize: 13, fontWeight: '600', color: c.muted },
    segTextOn: { color: c.primary, fontWeight: '700' },
  });
