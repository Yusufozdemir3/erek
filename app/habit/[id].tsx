// Alışkanlık istatistik ekranı — son 90 günün ısı haritası + özet sayılar.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useHabitStats, type DayCell } from '@/ui/useHabitStats';
import { colors, DEFAULT_HABIT_COLOR, shared } from '@/ui/theme';

// Tam sayıysa ondalık gösterme (5, 5.5) — AmountStepper'daki fmt ile aynı kural.
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function Heatmap({ days, color }: { days: DayCell[]; color: string }) {
  return (
    <View style={styles.grid}>
      {days.map((d) => (
        <View
          key={d.date}
          style={[
            styles.cell,
            !d.scheduled && styles.cellUnscheduled,
            d.scheduled && d.completed && { backgroundColor: color },
            d.scheduled && !d.completed && styles.cellMissed,
          ]}
        />
      ))}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HabitStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stats = useHabitStats(id);

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>‹ Geri</Text>
        </Pressable>

        {!stats.habit ? (
          <Text style={shared.empty}>Alışkanlık bulunamadı.</Text>
        ) : (
          <>
            <View style={styles.headRow}>
              {stats.habit.icon && <Text style={styles.icon}>{stats.habit.icon}</Text>}
              <Text style={shared.greeting}>{stats.habit.title}</Text>
            </View>

            <View style={styles.statsRow}>
              <StatCard label="Güncel seri" value={`🔥 ${stats.currentStreak}`} />
              <StatCard label="En uzun seri" value={String(stats.longestStreak)} />
              <StatCard label="Tamamlanma" value={`%${Math.round(stats.completionRate * 100)}`} />
            </View>

            {stats.totalAmount != null && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>Son 90 günde toplam</Text>
                <Text style={styles.cardValue}>
                  {fmtAmount(stats.totalAmount)}
                  {stats.habit.unit ? ` ${stats.habit.unit}` : ''}
                </Text>
              </View>
            )}

            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
              Son 90 gün · {stats.completedCount}/{stats.scheduledCount} planlı gün tamamlandı
            </Text>
            <Heatmap days={stats.days} color={stats.habit.color ?? DEFAULT_HABIT_COLOR} />

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: stats.habit.color ?? DEFAULT_HABIT_COLOR }]} />
                <Text style={styles.legendText}>Tamamlandı</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellMissed]} />
                <Text style={styles.legendText}>Kaçırıldı</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellUnscheduled]} />
                <Text style={styles.legendText}>Planlı değil</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backRow: { marginBottom: 12 },
  backText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 28 },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, marginTop: 4, textAlign: 'center' },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  cardValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  cell: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: '#eef2f7',
  },
  cellMissed: { backgroundColor: '#fecaca' },
  cellUnscheduled: { backgroundColor: '#f1f5f9' },

  legend: { flexDirection: 'row', gap: 16, marginTop: 16, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 4, backgroundColor: '#eef2f7' },
  legendText: { fontSize: 12, color: colors.muted },
});
