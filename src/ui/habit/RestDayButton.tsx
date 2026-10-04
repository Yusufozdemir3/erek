// "Take today off" on a habit's stats screen: a rest day (sick, travelling)
// keeps the streak and stays out of the completion rate. Offered for today only
// and only while the habit is due today and not done yet — a day already
// ticked is not a rest day. When today already is one, the same row undoes it.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Habit } from '@/db';
import { habitRepo } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';
import { tapLight } from '@/lib/haptics';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export function RestDayButton({ habit, onChanged }: { habit: Habit; onChanged: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const today = todayDate();
  const skipped = !!habit.skip_dates?.includes(today);
  const dueToday =
    isScheduledOn(habit.schedule, today) && isWithinHabitDates(habit.start_date, habit.end_date, today);
  const startedToday = habitRepo.isCompletedOn(habit.id, today) || habitRepo.getAmountOn(habit.id, today) > 0;
  if (!skipped && (!dueToday || startedToday)) return null;

  const toggle = () => {
    habitRepo.setSkipped(habit.id, today, !skipped);
    tapLight();
    onChanged();
  };

  return (
    <View style={styles.card}>
      {skipped && <Text style={styles.note}>{t('habit.restDayTaken')}</Text>}
      <Pressable
        onPress={toggle}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={
          skipped
            ? t('habit.restDayUndoA11y', { title: habit.title })
            : t('habit.restDayTakeA11y', { title: habit.title })
        }
      >
        <Text style={styles.btnText}>{skipped ? t('habit.restDayUndo') : t('habit.restDayTake')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { marginTop: 16, gap: 8, alignItems: 'flex-start' },
    note: { fontSize: 13, color: c.muted },
    btn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    btnText: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
