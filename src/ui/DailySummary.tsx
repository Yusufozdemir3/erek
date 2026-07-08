// "Bugün" ekranının üst özeti: o günün alışkanlık ve görev ilerlemesi mini
// çubuklarla. Tamamlanınca çubuk + sayı yeşile döner (motive edici). Hem
// alışkanlık hem görev boşsa hiç görünmez. Renkler theme token'ından.

import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const ratio = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
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
  if (habitsTotal === 0 && tasksTotal === 0) return null;
  return (
    <View style={styles.card}>
      {habitsTotal > 0 && <Bar label="🔥 Alışkanlık" done={habitsDone} total={habitsTotal} />}
      {tasksTotal > 0 && <Bar label="✅ Görev" done={tasksDone} total={tasksTotal} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { width: 92, fontSize: 13, fontWeight: '600', color: colors.muted },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.primary },
  fillDone: { backgroundColor: colors.done },
  count: { minWidth: 34, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.muted },
  countDone: { color: colors.done },
});
