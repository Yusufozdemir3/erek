// Alışkanlık istatistik ekranı — son 90 günün ısı haritası + özet sayılar.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtClock } from '@/lib/helpers';
import { STREAK_MILESTONES } from '@/lib/milestones';
import { useHabitStats, type DayCell } from '@/ui/useHabitStats';
import { useTheme } from '@/ui/ThemeProvider';
import { DEFAULT_HABIT_COLOR, type Colors } from '@/ui/theme';

type Styles = ReturnType<typeof makeStyles>;

// Tam sayıysa ondalık gösterme (5, 5.5) — AmountStepper'daki fmt ile aynı kural.
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function Heatmap({ days, color, styles }: { days: DayCell[]; color: string; styles: Styles }) {
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

function StatCard({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function HabitStatsScreen() {
  const { colors, shared } = useTheme();
  const styles = makeStyles(colors);
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
              <StatCard label="Güncel seri" value={`🔥 ${stats.currentStreak}`} styles={styles} />
              <StatCard label="En uzun seri" value={String(stats.longestStreak)} styles={styles} />
              <StatCard
                label="Tamamlanma"
                value={`%${Math.round(stats.completionRate * 100)}`}
                styles={styles}
              />
            </View>

            {stats.totalAmount != null && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>Son 90 günde toplam</Text>
                <Text style={styles.cardValue}>
                  {stats.habit.kind === 'timer'
                    ? fmtClock(stats.totalAmount)
                    : `${fmtAmount(stats.totalAmount)}${stats.habit.unit ? ` ${stats.habit.unit}` : ''}`}
                </Text>
              </View>
            )}

            {/* Rozetler — en uzun seri eşiği geçtiyse kazanılmış sayılır (seri
                düşse bile madalya kalır). Kilitliler soluk. */}
            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>Rozetler</Text>
            <View style={styles.badgeRow}>
              {STREAK_MILESTONES.map((m) => {
                const earned = stats.longestStreak >= m.days;
                return (
                  <View
                    key={m.days}
                    style={[styles.badge, earned ? styles.badgeEarned : styles.badgeLocked]}
                  >
                    <Text style={[styles.badgeEmoji, !earned && styles.badgeEmojiLocked]}>
                      {m.emoji}
                    </Text>
                    <Text style={[styles.badgeDays, earned && styles.badgeDaysEarned]}>
                      {m.days} gün
                    </Text>
                    <Text style={styles.badgeLabel}>{m.label}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
              Son 90 gün · {stats.completedCount}/{stats.scheduledCount} planlı gün tamamlandı
            </Text>
            <Heatmap days={stats.days} color={stats.habit.color ?? DEFAULT_HABIT_COLOR} styles={styles} />

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

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { fontSize: 28 },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 12, color: c.muted, marginTop: 4, textAlign: 'center' },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardLabel: { fontSize: 13, color: c.muted, fontWeight: '600' },
    cardValue: { fontSize: 20, fontWeight: '800', color: c.text, marginTop: 4 },

    // — Streak rozetleri —
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    badge: {
      flexGrow: 1,
      flexBasis: 70,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 14,
      borderWidth: 1,
    },
    badgeEarned: { backgroundColor: c.primarySoft, borderColor: c.primary },
    badgeLocked: { backgroundColor: c.card, borderColor: c.border },
    badgeEmoji: { fontSize: 26 },
    badgeEmojiLocked: { opacity: 0.3 },
    badgeDays: { fontSize: 13, fontWeight: '800', color: c.faint, marginTop: 4 },
    badgeDaysEarned: { color: c.text },
    badgeLabel: { fontSize: 11, color: c.muted, marginTop: 1 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
    cell: {
      width: 20,
      height: 20,
      borderRadius: 5,
      backgroundColor: c.track,
    },
    // Kaçırılan gün: iki temada da okunur bir kırmızı. Planlı değil: zeminden
    // ayrılan soluk gri (bg değil — bg zeminle aynı olup görünmez kalıyordu).
    cellMissed: { backgroundColor: '#f87171' },
    cellUnscheduled: { backgroundColor: c.border },

    legend: { flexDirection: 'row', gap: 16, marginTop: 16, flexWrap: 'wrap' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 12, height: 12, borderRadius: 4, backgroundColor: c.track },
    legendText: { fontSize: 12, color: c.muted },
  });
