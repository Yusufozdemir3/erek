// Alışkanlık istatistik ekranı — özet sayılar, Gün/Hafta/Ay tamamlama grafiği,
// seri geçmişi (ilk 5), aylık takvim + en altta rozetler.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtClock, isQuotaSchedule } from '@/lib/helpers';
import { STREAK_MILESTONES } from '@/lib/milestones';
import { useHabitStats, type ChartBucket, type HabitChartSeries, type StreakEntry } from '@/ui/useHabitStats';
import { useHabitCalendar, type CalendarDay } from '@/ui/useHabitCalendar';
import { BarChart } from '@/ui/BarChart';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR, shortDate, type Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';

type Styles = ReturnType<typeof makeStyles>;

// Tam sayıysa ondalık gösterme (5, 5.5) — AmountStepper'daki fmt ile aynı kural.
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

// Tamamlama grafiği kartının içi: Gün/Hafta/Ay segment seçici + çubuk grafik.
// Gün görünümünde her çubuk o günün oranı (nicel/zamanlayıcıda miktar/hedef,
// ikilide 0/1); hafta/ay görünümünde kovanın planlı-gün tamamlanma oranı.
// Seyrek eksen etiketleri (ilk/orta/son kova) çağıranın verdiği biçimleyiciyle
// üretilir (yerel ay/gün adları için).
type ChartPeriod = 'day' | 'week' | 'month';

function CompletionChart({
  series,
  color,
  t,
  formatLabel,
  styles,
  trackColor,
  labelColor,
}: {
  series: HabitChartSeries;
  color: string;
  t: (key: string) => string;
  formatLabel: (period: ChartPeriod, bucket: ChartBucket) => string;
  styles: Styles;
  trackColor: string;
  labelColor: string;
}) {
  const [period, setPeriod] = useState<ChartPeriod>('day');
  const buckets = series[period];
  const ratios = buckets.map((b) => b.ratio);
  // İlk/orta/son kovadan seyrek etiketler (2 kovada ilk+son, tek kovada yalnız o).
  const labelIdx =
    buckets.length >= 3
      ? [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1]
      : buckets.map((_, i) => i);
  const labels = [...new Set(labelIdx)].map((i) => formatLabel(period, buckets[i]));
  const current = buckets.length > 0 ? buckets[buckets.length - 1].ratio : 0;

  const PERIODS: { key: ChartPeriod; labelKey: string }[] = [
    { key: 'day', labelKey: 'stats.periodDay' },
    { key: 'week', labelKey: 'stats.periodWeek' },
    { key: 'month', labelKey: 'stats.periodMonth' },
  ];

  return (
    <>
      <View style={styles.periodRow}>
        {PERIODS.map((p) => {
          const sel = period === p.key;
          return (
            <Pressable
              key={p.key}
              style={[styles.periodBtn, sel && styles.periodBtnSel]}
              onPress={() => setPeriod(p.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
            >
              <Text style={[styles.periodText, sel && styles.periodTextSel]}>{t(p.labelKey)}</Text>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        <Text style={styles.periodCurrent}>%{Math.round(current * 100)}</Text>
      </View>
      <BarChart
        ratios={ratios}
        color={color}
        trackColor={trackColor}
        labels={labels}
        labelColor={labelColor}
      />
    </>
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

// Seri geçmişi: en uzundan en kısaya İLK 5 seri, her satırda uzunluk + tarih
// aralığı + en uzuna göre oranlı bir çubuk (kabaca karşılaştırma için).
function StreakList({
  streaks,
  color,
  lang,
  t,
  suffixKey,
  styles,
}: {
  streaks: StreakEntry[];
  color: string;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  suffixKey: string; // kota alışkanlıkta '{n} hafta', diğerlerinde '{n} gün'
  styles: Styles;
}) {
  const top = streaks.slice(0, 5);
  const max = top[0]?.length ?? 1;
  return (
    <View style={{ gap: 8 }}>
      {top.map((s, i) => (
        <View key={`${s.start}-${i}`} style={styles.streakRow}>
          <Text style={styles.streakLen}>{t(suffixKey, { n: s.length })}</Text>
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

export default function HabitStatsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const stats = useHabitStats(id);
  const calendar = useHabitCalendar(id);
  const habitColor = stats.habit?.color ?? DEFAULT_HABIT_COLOR;
  // Kota (haftada X kez) alışkanlıkta seriler HAFTA bazındadır: etiket/birim
  // farklı, rozet eşikleri (gün cinsinden) hafta×7 ile karşılaştırılır.
  const isQuota = isQuotaSchedule(stats.habit?.schedule ?? null);
  const streakDays = isQuota ? stats.longestStreak * 7 : stats.longestStreak;
  const monthLabel = new Date(calendar.year, calendar.month, 1).toLocaleDateString(DATE_LOCALE[lang], {
    month: 'long',
    year: 'numeric',
  });

  // Grafiğin seyrek eksen etiketleri: gün/hafta kovasında "28 Haz" gibi kısa
  // tarih (hafta kovasında haftanın pazartesisi), ay kovasında yalnız ay adı.
  const formatBucketLabel = (period: ChartPeriod, bucket: ChartBucket): string => {
    if (period === 'month') {
      return new Date(`${bucket.date}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], { month: 'short' });
    }
    return shortDate(bucket.date, lang);
  };

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
              {stats.habit.icon && <HabitIconGlyph id={stats.habit.icon} size={26} color={habitColor} />}
              <Text style={shared.greeting}>{stats.habit.title}</Text>
            </View>

            <View style={styles.statsRow}>
              <StatCard
                label={t(isQuota ? 'stats.currentStreakWeeks' : 'stats.currentStreak')}
                value={`🔥 ${stats.currentStreak}`}
                styles={styles}
              />
              <StatCard
                label={t(isQuota ? 'stats.longestStreakWeeks' : 'stats.longestStreak')}
                value={String(stats.longestStreak)}
                styles={styles}
              />
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

            {/* Tamamlama grafiği — Gün/Hafta/Ay seçilebilir çubuk görünüm. */}
            {stats.series && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>{t('stats.chart')}</Text>
                <CompletionChart
                  series={stats.series}
                  color={habitColor}
                  t={t}
                  formatLabel={formatBucketLabel}
                  styles={styles}
                  trackColor={colors.track}
                  labelColor={colors.faint}
                />
              </View>
            )}

            {/* Seri geçmişi — en uzun 5 seri. */}
            {stats.streaks.length > 0 && (
              <>
                <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>
                  {t('stats.streakHistory')}
                </Text>
                <StreakList
                  streaks={stats.streaks}
                  color={habitColor}
                  lang={lang}
                  t={t}
                  suffixKey={isQuota ? 'stats.weeksSuffix' : 'stats.daysSuffix'}
                  styles={styles}
                />
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

            {/* Rozetler — en uzun seri eşiği geçtiyse kazanılmış sayılır (seri
                düşse bile madalya kalır). Kilitliler soluk. */}
            <Text style={[shared.subtitle, { marginTop: 24, marginBottom: 12 }]}>{t('stats.badges')}</Text>
            <View style={styles.badgeRow}>
              {STREAK_MILESTONES.map((m) => {
                const earned = streakDays >= m.days;
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

    // Kaçırılan gün (aylık takvim): iki temada da okunur bir kırmızı. Planlı
    // değil: zeminden ayrılan soluk gri (bg değil — bg zeminle aynı olup görünmez
    // kalıyordu).
    cellMissed: { backgroundColor: '#f87171' },
    cellUnscheduled: { backgroundColor: c.border },

    // — Tamamlama grafiği (Gün/Hafta/Ay) —
    periodRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 14 },
    periodBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    periodBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft },
    periodText: { fontSize: 12, fontWeight: '700', color: c.faint },
    periodTextSel: { color: c.primary },
    periodCurrent: { fontSize: 16, fontWeight: '800', color: c.text },

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
