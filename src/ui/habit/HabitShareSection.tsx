// "Share with friends" card on the owner's habit stats screen: the friend sees
// the habit's full history, read-only (see src/sync/sharedHabits.ts). A switch
// decides whether friends may also join ("do it together") or only watch.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Habit } from '@/db';
import { getHabitShareMode, listHabitShares, setHabitShareMode, shareHabit, unshareHabit } from '@/sync';
import { tapLight } from '@/lib/haptics';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { ShareWithFriendsSection } from '@/ui/ShareWithFriendsSection';
import type { Colors } from '@/ui/theme';

export function HabitShareSection({ habit }: { habit: Habit }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  // Until a friend is picked there is nothing stored: the switch starts on "watch".
  const [together, setTogether] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getHabitShareMode(habit.id)
        .then((m) => {
          if (active && m !== null) setTogether(m);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [habit.id])
  );

  const pick = (value: boolean) => {
    if (value === together) return;
    tapLight();
    setTogether(value);
    // Updates the habit's existing shares (none yet = nothing to update; new ones follow `together`).
    setHabitShareMode(habit.id, value).catch(() => {});
  };

  const share = async (id: string, friendId: string) => {
    await shareHabit(id, friendId);
    await setHabitShareMode(id, together);
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
      share={share}
      unshare={unshareHabit}
      notSyncedCode="ERK_HABIT_NOT_SYNCED"
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
    seg: { flexDirection: 'row', backgroundColor: c.track, borderRadius: 12, padding: 3, marginBottom: 12 },
    segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
    segOn: { backgroundColor: c.card },
    segText: { fontSize: 13, fontWeight: '600', color: c.muted },
    segTextOn: { color: c.primary, fontWeight: '700' },
  });
