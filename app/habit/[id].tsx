// Alışkanlık istatistik ekranı — son 90 günün ısı haritası + özet sayılar.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtClock } from '@/lib/helpers';
import { STREAK_MILESTONES } from '@/lib/milestones';
import { useHabitStats, type DayCell, type ScorePoint, type StreakEntry, type WeekdayStat } from '@/ui/useHabitStats';
import { useHabitCalendar, type CalendarDay } from '@/ui/useHabitCalendar';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR, shortDate, type Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';

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

// Güç puanı grafiği: her gün için 0..1 skoru ince bir çubukla temsil eder
// (bar sparkline). Yeni SVG bağımlılığı gerektirmesin diye salt View'lerle.
function ScoreGraph({ score, color, styles }: { score: ScorePoint[]; color: string; styles: Styles }) {
  if (score.length === 0) return null;
  return (
    <View style={styles.scoreBars}>
      {score.map((p) => (
        <View key={p.date} style={styles.scoreBarTrack}>
          <View
            style={[
              styles.scoreBarFill,
              { height: `${Math.max(3, Math.round(p.score * 100))}%`, backgroundColor: color },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

// Ay takvimi: Pazartesi başlangıçlı hafta ızgarası, her hücrede gün numarası.
// Gelecek günler (henüz yaşanmadı) "planlı değil" ile aynı nötr görünümde —
// ayrı bir efsane girdisi gerektirmesin diye bilinçli olarak aynı stil.
function MonthCalendar({
  weeks,
  color,
  styles,
}: {
  weeks: (CalendarDay | null)[][];
  color: string;
  styles: Styles;
}) {
  return (
    <View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={styles.calCell} />;
            const dayNum = Number(cell.date.slice(8, 10));
            const missed = cell.scheduled && !cell.completed && !cell.future;
            const done = cell.scheduled && cell.completed;
            return (
              <View
                key={ci}
                style={[
                  styles.calCell,
                  styles.calCellFilled,
                  (!cell.scheduled || cell.future) && styles.cellUnscheduled,
                  missed && styles.cellMissed,
                  done && { backgroundColor: color },
                ]}
              >
                <Text style={[styles.calDayText, done && styles.calDayTextOn]}>{dayNum}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// Seri geçmişi: en uzundan en kısaya, her satırda uzunluk + tarih aralığı +
// en uzuna göre oranlı bir çubuk (kabaca karşılaştırma için).
function StreakList({
  streaks,
  color,
  lang,
  t,
  styles,
}: {
  streaks: StreakEntry[];
  color: string;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  styles: Styles;
}) {
  const max = streaks[0]?.length ?? 1;
  return (
    <View style={{ gap: 8 }}>
      {streaks.map((s, i) => (
        <View key={`${s.start}-${i}`} style={styles.streakRow}>
          <Text style={styles.streakLen}>{t('stats.daysSuffix', { n: s.length })}</Text>
          <View style={styles.streakBarTrack}>
            <View
              style={[styles.streakBarFill, { width: `${(s.length / max) * 100}%`, backgroundColor: color }]}
            />
          </View>
          <Text style={styles.streakRange}>
            {s.start === s.end ? shortDate(s.start, lang) : `${shortDate(s.start, lang)} – ${shortDate(s.end, lang)}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Haftanın günü grafiği: Pzt..Paz, her çubuk o günün tamamlanma oranı.
function WeekdayChart({
  weekday,
  color,
  t,
  styles,
}: {
  weekday: WeekdayStat[];
  color: string;
  t: (key: string) => string;
  styles: Styles;
}) {
  const WD_KEYS = ['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'];
  return (
    <View style={styles.wdRow}>
      {weekday.map((w, i) => (
        <View key={w.wd} style={styles.wdCol}>
          <Text style={styles.wdPct}>{w.scheduled > 0 ? `%${Math.round(w.rate * 100)}` : '–'}</Text>
          <View style={styles.wdBarTrack}>
            <View
              style={[styles.wdBarFill, { height: `${Math.max(3, Math.round(w.rate * 100))}%`, backgroundColor: color }]}
            />
          </View>
          <Text style={styles.wdLabel}>{t(WD_KEYS[i])}</Text>
        </View>
      ))}
    </View>
  );
}

export default function HabitStatsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const stats = useHabitStats(id);
  const calendar = useHabitCalendar(id);
  const habitColor = stats.habit?.color ?? DEFAULT_HABIT_COLOR;
  const monthLabel = new Date(calendar.year, calendar.month, 1).toLocaleDateString(DATE_LOCALE[lang], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!stats.habit ? (
          <Text style={shared.empty}>{t('stats.notFound')}</Text>
        ) : (
          <>
            <View style={styles.headRow}>
              {stats.habit.icon && <Text style={styles.icon}>{stats.habit.icon}</Text>}
              <Text style={shared.greeting}>{stats.habit.title}</Text>
            </View>

            <View style={styles.statsRow}>
              <StatCard label={t('stats.currentStreak')} value={`🔥 ${stats.currentStreak}`} styles={styles} />
              <StatCard label={t('stats.longestStreak')} value={String(stats.longestStreak)} styles={styles} />
              <StatCard
                label={t('stats.completionRate')}
                value={`%${Math.round(stats.completionRate * 100)}`}
                styles={styles}
              />
            </View>

            {stats.totalAmount != null && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>{t('stats.totalLast90')}</Text>
                <Text style={styles.cardValue}>
                  {stats.habit.kind === 'timer'
                    ? fmtClock(stats.totalAmount)
                    : `${fmtAmount(stats.totalAmount)}${stats.habit.unit ? ` ${stats.habit.unit}` : ''}`}
                </Text>
              </View>
            )}

            {/* Güç puanı — Loop Habit Tracker'daki fikirden esinlenen, son
                günlere ağırlık veren üstel hareketli ortalama (bkz. habitRepo.scoreHistory). */}
            {stats.score.length > 0 && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <View style={styles.scoreHead}>
                  <Text style={styles.cardLabel}>{t('stats.score')}</Text>
                  <Text style={[styles.cardValue, { marginTop: 0 }]}>
                    %{Math.round(stats.score[stats.score.length - 1].score * 100)}
                  </Text>
                </View>
                <ScoreGraph score={stats.score} color={habitColor} styles={styles} />
                <Text style={styles.scoreHint}>{t('stats.scoreHint')}</Text>
              </View>
            )}

            {/* Rozetler — en uzun seri eşiği geçtiyse kazanılmış sayılır (seri
                düşse bile madalya kalır). Kilitliler soluk. */}
            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>{t('stats.badges')}</Text>
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
                      {t('stats.daysSuffix', { n: m.days })}
                    </Text>
                    <Text style={styles.badgeLabel}>{t(m.labelKey)}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
              {t('stats.last90Summary', { done: stats.completedCount, total: stats.scheduledCount })}
            </Text>
            <Heatmap days={stats.days} color={stats.habit.color ?? DEFAULT_HABIT_COLOR} styles={styles} />

            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: stats.habit.color ?? DEFAULT_HABIT_COLOR }]} />
                <Text style={styles.legendText}>{t('stats.legendDone')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellMissed]} />
                <Text style={styles.legendText}>{t('stats.legendMissed')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.cellUnscheduled]} />
                <Text style={styles.legendText}>{t('stats.legendUnscheduled')}</Text>
              </View>
            </View>

            {/* Haftanın günü — hangi günler güçlü/zayıf tamamlanıyor. */}
            {stats.weekday.length > 0 && (
              <>
                <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
                  {t('stats.weekdayBreakdown')}
                </Text>
                <WeekdayChart weekday={stats.weekday} color={habitColor} t={t} styles={styles} />
              </>
            )}

            {/* Seri geçmişi — en uzundan en kısaya TÜM geçmiş seriler. */}
            {stats.streaks.length > 0 && (
              <>
                <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
                  {t('stats.streakHistory')}
                </Text>
                <StreakList streaks={stats.streaks} color={habitColor} lang={lang} t={t} styles={styles} />
              </>
            )}

            {/* Tam takvim — ay ay gezinilebilir. */}
            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>{t('stats.calendar')}</Text>
            <View style={styles.calHead}>
              <Pressable
                onPress={calendar.goPrev}
                disabled={!calendar.canGoPrev}
                hitSlop={8}
                style={[styles.calNavBtn, !calendar.canGoPrev && styles.calNavBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t('stats.prevMonthA11y')}
              >
                <Feather name="chevron-left" size={18} color={calendar.canGoPrev ? colors.text : colors.faint} />
              </Pressable>
              <Text style={styles.calMonthLabel}>
                {monthLabel.charAt(0).toLocaleUpperCase(DATE_LOCALE[lang]) + monthLabel.slice(1)}
              </Text>
              <Pressable
                onPress={calendar.goNext}
                disabled={!calendar.canGoNext}
                hitSlop={8}
                style={[styles.calNavBtn, !calendar.canGoNext && styles.calNavBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t('stats.nextMonthA11y')}
              >
                <Feather name="chevron-right" size={18} color={calendar.canGoNext ? colors.text : colors.faint} />
              </Pressable>
            </View>
            <View style={styles.calWeekHead}>
              {['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'].map(
                (k) => (
                  <Text key={k} style={styles.calWeekHeadText}>
                    {t(k)}
                  </Text>
                )
              )}
            </View>
            <MonthCalendar weeks={calendar.weeks} color={habitColor} styles={styles} />
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

    // — Güç puanı grafiği —
    scoreHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    scoreHint: { fontSize: 11, color: c.faint, marginTop: 10, lineHeight: 15 },
    scoreBars: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 1.5, marginTop: 12 },
    scoreBarTrack: { flex: 1, height: '100%', justifyContent: 'flex-end' },
    scoreBarFill: { width: '100%', borderRadius: 1, minHeight: 2 },

    // — Haftanın günü çubuk grafiği —
    wdRow: { flexDirection: 'row', gap: 8 },
    wdCol: { flex: 1, alignItems: 'center' },
    wdPct: { fontSize: 10, color: c.muted, fontWeight: '700', marginBottom: 4 },
    wdBarTrack: {
      width: '100%',
      height: 56,
      borderRadius: 6,
      backgroundColor: c.track,
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    wdBarFill: { width: '100%', borderRadius: 6 },
    wdLabel: { fontSize: 11, color: c.muted, marginTop: 6, fontWeight: '600' },

    // — Seri geçmişi listesi —
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    streakLen: { width: 52, fontSize: 12, fontWeight: '700', color: c.text },
    streakBarTrack: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    streakBarFill: { height: '100%', borderRadius: 5 },
    streakRange: { fontSize: 11, color: c.muted, minWidth: 92, textAlign: 'right' },

    // — Ay takvimi —
    calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    calNavBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calNavBtnDisabled: { opacity: 0.4 },
    calMonthLabel: { fontSize: 15, fontWeight: '700', color: c.text },
    calWeekHead: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
    calWeekHeadText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.faint },
    calRow: { flexDirection: 'row' },
    calCell: { flex: 1, aspectRatio: 1, margin: 2, alignItems: 'center', justifyContent: 'center' },
    calCellFilled: { borderRadius: 8, backgroundColor: c.track },
    calDayText: { fontSize: 12, fontWeight: '600', color: c.muted },
    calDayTextOn: { color: c.onAccent, fontWeight: '800' },
  });
