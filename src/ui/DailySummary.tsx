// Top summary of the "Today" screen: that day's habit and task progress shown
// with mini bars. When complete, the bar + count turn green (motivating). Hidden
// entirely if both habits and tasks are empty.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import type { Colors } from './theme';

function Bar({
  type,
  label,
  done,
  total,
  styles,
  iconColor,
}: {
  type: EntityType;
  label: string;
  done: number;
  total: number;
  styles: ReturnType<typeof makeStyles>;
  iconColor: string;
}) {
  const ratio = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <EntityIcon type={type} size={14} color={iconColor} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }, complete && styles.fillDone]}
        />
      </View>
      <Text style={[styles.count, complete && styles.countDone]}>
        {done}/{total}
      </Text>
    </View>
  );
}

interface Props {
  habitsDone: number;
  habitsTotal: number;
  tasksDone: number;
  tasksTotal: number;
}

export function DailySummary({ habitsDone, habitsTotal, tasksDone, tasksTotal }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  if (habitsTotal === 0 && tasksTotal === 0) return null;
  return (
    <View style={styles.card}>
      {habitsTotal > 0 && (
        <Bar
          type="habit"
          label={t('summary.habits')}
          done={habitsDone}
          total={habitsTotal}
          styles={styles}
          iconColor={colors.streak}
        />
      )}
      {tasksTotal > 0 && (
        <Bar
          type="task"
          label={t('summary.tasks')}
          done={tasksDone}
          total={tasksTotal}
          styles={styles}
          iconColor={colors.primary}
        />
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginTop: 16,
      gap: 10,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 92 },
    label: { fontSize: 13, fontWeight: '600', color: c.muted },
    track: {
      flex: 1,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 4, backgroundColor: c.primary },
    fillDone: { backgroundColor: c.done },
    count: { minWidth: 34, textAlign: 'right', fontSize: 13, fontWeight: '700', color: c.muted },
    countDone: { color: c.done },
  });
