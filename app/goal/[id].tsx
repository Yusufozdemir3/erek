// Hedef istatistik ekranı — ilerleme, kalan miktar/adım, son tarihe göre
// gereken günlük/haftalık tempo ve bu hedefe bağlı alışkanlıklar.
// "Hedefler" sekmesinde bir kartın istatistik ikonuna dokununca açılır.
// habit/[id].tsx ile aynı desen (Faz: geri düğmesi + ScrollView), ama günlük
// log geçmişi olmadığından ısı haritası/takvim yok — yalnızca mevcut alanlardan
// (current_value/target_value/deadline) türetilen anlık hesaplar.
// Mimari kural: SQL yok; yalnızca useGoalStats (goalRepo/goalMilestoneRepo/
// habitRepo üzerinden) çağrılır.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useGoalStats, type LinkedHabit } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DEFAULT_HABIT_COLOR, deadlineLabel, type Colors } from '@/ui/theme';
import type { GoalMilestone } from '@/db';

type Styles = ReturnType<typeof makeStyles>;

// Tam sayıysa ondalık gösterme, değilse 1 ondalık (AmountStepper/HabitStats'taki fmt ile aynı desen).
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function StatCard({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MilestoneRow({ m, color, styles }: { m: GoalMilestone; color: string; styles: Styles }) {
  const done = m.completed === 1;
  return (
    <View style={styles.milestoneRow}>
      <View style={[styles.milestoneBox, done && { backgroundColor: color, borderColor: color }]}>
        {done && <Text style={styles.milestoneCheck}>✓</Text>}
      </View>
      <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>{m.title}</Text>
    </View>
  );
}

function LinkedHabitRow({
  habit,
  styles,
}: {
  habit: LinkedHabit;
  styles: Styles;
}) {
  const color = habit.color ?? DEFAULT_HABIT_COLOR;
  return (
    <Pressable
      style={styles.habitRow}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      accessibilityRole="button"
    >
      <View style={[styles.habitDot, { backgroundColor: color + '22', borderColor: color }]}>
        {habit.icon ? <Text style={styles.habitIconText}>{habit.icon}</Text> : null}
      </View>
      <Text style={styles.habitTitle} numberOfLines={1}>
        {habit.title}
      </Text>
      <Text style={styles.habitChevron}>›</Text>
    </Pressable>
  );
}

export default function GoalStatsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const stats = useGoalStats(id);

  const dLabel = deadlineLabel(stats.goal?.deadline ?? null, {
    daysLeft: (n) => t('date.daysLeft', { n }),
    dueToday: t('date.dueToday'),
    daysAgo: (n) => t('date.daysAgo', { n }),
  });

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!stats.goal ? (
          <Text style={shared.empty}>{t('goalStats.notFound')}</Text>
        ) : (
          <>
            <Text style={shared.greeting}>{stats.goal.title}</Text>

            <View style={styles.statsRow}>
              {stats.goal.goal_type === 'numeric' ? (
                <>
                  <StatCard label={t('goal.statRatio')} value={`%${Math.round(stats.ratio * 100)}`} styles={styles} />
                  <StatCard
                    label={t('goal.statRemaining')}
                    value={
                      stats.remaining != null
                        ? `${fmtAmount(stats.remaining)}${stats.goal.unit ? ` ${stats.goal.unit}` : ''}`
                        : '–'
                    }
                    styles={styles}
                  />
                </>
              ) : (
                <StatCard
                  label={t('goal.statMilestones')}
                  value={`${stats.milestonesDone}/${stats.milestonesTotal}`}
                  styles={styles}
                />
              )}
              <StatCard label={t('goal.statDeadline')} value={dLabel || '–'} styles={styles} />
            </View>

            {stats.goal.goal_type === 'numeric' && stats.goal.target_value != null && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(stats.ratio * 100)}%` }]} />
              </View>
            )}

            {/* Tempo kartı: durum hiyerarşisi — tamamlandı > gecikmiş > son tarihsiz > hesaplanabilir tempo. */}
            <View style={[styles.card, { marginTop: 20 }]}>
              <Text style={styles.cardLabel}>{t('goalStats.paceTitle')}</Text>
              {stats.completed ? (
                <Text style={styles.paceLine}>{t('goalStats.completed')}</Text>
              ) : stats.isOverdue ? (
                <Text style={[styles.paceLine, { color: colors.danger }]}>{t('goalStats.overdue')}</Text>
              ) : !stats.goal.deadline ? (
                <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>
              ) : stats.goal.goal_type === 'numeric' && stats.dailyPace != null ? (
                <>
                  <Text style={styles.paceLine}>
                    {t('goalStats.dailyPaceLine', {
                      amountUnit: `${fmtAmount(stats.dailyPace)}${stats.goal.unit ? ` ${stats.goal.unit}` : ''}`,
                    })}
                  </Text>
                  {stats.weeklyPace != null && (
                    <Text style={styles.paceHint}>
                      {t('goalStats.weeklyPaceHint', {
                        amountUnit: `${fmtAmount(stats.weeklyPace)}${stats.goal.unit ? ` ${stats.goal.unit}` : ''}`,
                      })}
                    </Text>
                  )}
                </>
              ) : stats.goal.goal_type === 'milestone' && stats.milestonePaceDays != null ? (
                <Text style={styles.paceLine}>
                  {t('goalStats.milestonePaceLine', {
                    n: stats.milestonesRemaining,
                    days: fmtAmount(stats.milestonePaceDays),
                  })}
                </Text>
              ) : (
                <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>
              )}
            </View>

            {/* Bağlı alışkanlıklar — bu hedefe katkı sağlayan alışkanlıklar (bkz. HabitForm.linkGoal). */}
            {stats.linkedHabits.length > 0 && (
              <>
                <Text style={[shared.subtitle, styles.sectionTitle]}>{t('goalStats.linkedHabits')}</Text>
                <View style={styles.card}>
                  {stats.linkedHabits.map((h, i) => (
                    <View key={h.id} style={i > 0 && styles.habitRowDivider}>
                      <LinkedHabitRow habit={h} styles={styles} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Adımlar — yalnızca 'milestone' hedefte; salt-okunur (düzenleme GoalEditModal'da). */}
            {stats.goal.goal_type === 'milestone' && stats.milestones.length > 0 && (
              <>
                <Text style={[shared.subtitle, styles.sectionTitle]}>{t('goal.milestones')}</Text>
                <View style={styles.card}>
                  {stats.milestones.map((m) => (
                    <MilestoneRow key={m.id} m={m} color={colors.primary} styles={styles} />
                  ))}
                </View>
              </>
            )}
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

    progressTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: c.track,
      marginTop: 16,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardLabel: { fontSize: 13, color: c.muted, fontWeight: '600' },
    paceLine: { fontSize: 16, fontWeight: '700', color: c.text, marginTop: 6, lineHeight: 22 },
    paceHint: { fontSize: 13, color: c.faint, marginTop: 6, lineHeight: 18 },

    sectionTitle: { marginTop: 24, marginBottom: 12 },

    habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    habitRowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    habitDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    habitIconText: { fontSize: 14 },
    habitTitle: { flex: 1, fontSize: 14, color: c.text, fontWeight: '600' },
    habitChevron: { fontSize: 18, color: c.faint },

    milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    milestoneBox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneCheck: { color: c.onAccent, fontSize: 12, fontWeight: '800' },
    milestoneTitle: { flex: 1, fontSize: 14, color: c.text },
    milestoneTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
  });
