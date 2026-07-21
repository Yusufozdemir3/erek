// Alışkanlık istatistik ekranı — özet sayılar, Hedef/Puan/Geçmiş kartı,
// seri geçmişi (ilk 3), aylık takvim + en altta rozetler.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { fmtClock, isQuotaSchedule } from '@/lib/helpers';
import type { Habit } from '@/db';
import { STREAK_MILESTONES } from '@/lib/milestones';
import {
  useHabitStats,
  type BucketTotal,
  type GoalPeriodStat,
  type HabitChartSeries,
  type HabitStats,
  type StreakEntry,
} from '@/ui/useHabitStats';
import { useHabitCalendar, type CalendarDay } from '@/ui/useHabitCalendar';
import { ScoreLineChart } from '@/ui/ScoreLineChart';
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

// Büyük miktarları kısaltır (24500 -> "24.5k", 1_600_000 -> "1.6M") — Hafta/Ay/Yıl
// hedef toplamları hızla binlere/milyonlara çıkabildiği için (adım sayısı vb.).
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return fmtAmount(n);
}

// Hedef dönemi kartındaki bir değeri (done/goal) alışkanlık türüne göre biçimler:
// zamanlayıcıda saat, nicelde miktar+birim, ikilide düz gün sayısı.
function fmtGoalValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return `${fmtCompact(n)}${habit.unit ? ` ${habit.unit}` : ''}`;
}

// "Geçmiş" çubuğundaki değeri biçimler — fmtGoalValue ile AYNI tür ayrımı
// (zamanlayıcıda saat, nicelde miktar) ama birim EKLEMEZ (dar sütunlarda
// aşırı sıkışık görünüyordu, bkz. HistoryBars yorumu). Önceden zamanlayıcı
// alışkanlıklarda da fmtCompact kullanılıyordu — saniye toplamı "5.4k" gibi
// anlamsız bir sayıya dönüşüyordu (kullanıcı geri bildirimi).
function fmtHistoryValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return fmtCompact(n);
}

function StatCard({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Gün/Hafta/Ay periyodu — Puan ve Geçmiş bölümlerinin ikisi de kullanır
// (dayRatio tabanlı seri hazır olduğundan, bkz. useHabitStats.HabitChartSeries).
type ChartPeriod = 'day' | 'week' | 'month';

// Gün/Hafta/Ay seçici — Puan + Geçmiş kartlarının ikisi de aynı üçlü periyot
// desenini kullanır (tek kaynak, tutarlı metin/sıra).
const PERIOD_OPTIONS: { key: ChartPeriod; labelKey: string }[] = [
  { key: 'day', labelKey: 'stats.periodDay' },
  { key: 'week', labelKey: 'stats.periodWeek' },
  { key: 'month', labelKey: 'stats.periodMonth' },
];
const PERIOD_UNIT_KEY: Record<ChartPeriod, string> = {
  day: 'stats.unitDay',
  week: 'stats.unitWeek',
  month: 'stats.unitMonth',
};

// "Hedef + Puan + Geçmiş" — Claude Design'da onaylanan mockup'ın (Tur 9, kart
// 9a) BİREBİR portu: tek koyu kart, bölümler arasında ince ayraç. Renkler
// mockup'ın kendi paleti (zemin #0a0a0a, kenarlık #262626, ikincil metin #666/
// #999) — TEK bilinçli fark: mockup'ta sabit teal (#5eead4) olan vurgu rengi
// burada `color` (alışkanlığın kendi rengi) — uygulamanın geri kalanıyla
// (ikon, diğer grafikler) tutarlı kalsın diye dinamik bırakıldı.
// "Puan" — EMA (üstel hareketli ortalama) skoru; hesaplama artık ISINMA
// penceresi dahil useHabitStats.buildSeries içinde yapılıyor (bkz. o
// dosyadaki emaScores/attachScores) — burada yalnız hazır b.score okunur.

// "Geçmiş" bar etiketi: periyoda göre — ay kovasında hep ay adı, hafta
// kovasında yeni bir aya geçen ilk çubukta ay adı (mockup'taki "HAZ·22·29·TEM·13"
// deseni), gün kovasında kısa tarih.
function historyBarLabel(
  period: ChartPeriod,
  bucketStart: string,
  prevBucketStart: string | null,
  lang: Lang
): string {
  const d = new Date(`${bucketStart}T00:00:00`);
  if (period === 'month') {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  // 'day' ve 'week': sadece gün numarası, ay değiştiğinde bir kez ay adı da
  // eklenir. ('day' eskiden shortDate ile HER etikette ayı tekrarlıyordu —
  // kullanıcı ekran görüntüsünde yakaladı, bu düzeltme onun için.)
  if (!prevBucketStart || d.getMonth() !== new Date(`${prevBucketStart}T00:00:00`).getMonth()) {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  return String(d.getDate());
}

// Küçük Gün/Hafta/Ay sekme seçici — Puan ve Geçmiş bölümlerinin ikisi de
// kullanır (periodRow/periodBtn stilleri Tamamlama grafiğiyle PAYLAŞILIR).
function PeriodTabs({
  period,
  onChange,
  t,
  styles,
}: {
  period: ChartPeriod;
  onChange: (p: ChartPeriod) => void;
  t: (key: string) => string;
  styles: Styles;
}) {
  return (
    <View style={styles.statsPeriodRow}>
      {PERIOD_OPTIONS.map((p) => {
        const sel = period === p.key;
        return (
          <Pressable
            key={p.key}
            style={[styles.periodBtn, styles.statsPeriodBtn, sel && styles.periodBtnSel]}
            onPress={() => onChange(p.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
          >
            <Text style={[styles.periodText, sel && styles.periodTextSel]}>{t(p.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// "Geçmiş" çubukları — yatayda KAYDIRILABİLİR (Puan grafiğiyle aynı prensip):
// sabit genişlikli sütunlar, açılışta en güncel kovaya (sağ uca) otomatik
// kayar. Değer etiketinde birim YOK (yalnızca kısaltılmış sayı, ör. "11.4k")
// — dar sütunlarda birim eklemek aşırı sıkışık görünüyordu (kullanıcı geri
// bildirimi); birim zaten başlıkta/"Hedef" bölümünde okunabiliyor.
const HISTORY_COL_WIDTH_MIN = 20; // sütun başına ASGARİ piksel

function HistoryBars({
  buckets,
  period,
  habit,
  color,
  lang,
  styles,
}: {
  buckets: BucketTotal[];
  period: ChartPeriod;
  habit: Habit;
  color: string;
  lang: Lang;
  styles: Styles;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const didAutoScroll = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  // Az kova varken (ör. sadece 4 hafta) sütun genişliği KONTEYNERİ doldursun —
  // aksi halde çubuklar sol kenara yapışıp sağda çirkin bir boşluk bırakıyordu
  // (Puan grafiğindeki aynı düzeltme, bkz. ScoreLineChart).
  const colWidth =
    containerWidth > 0 ? Math.max(HISTORY_COL_WIDTH_MIN, containerWidth / buckets.length) : HISTORY_COL_WIDTH_MIN;

  return (
    <View onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}>
      {containerWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (didAutoScroll.current) return;
            didAutoScroll.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          <View style={styles.statsHistoryRow}>
            {buckets.map((b, i) => {
              const pct = b.total > 0 ? Math.max(6, Math.round((b.total / max) * 100)) : 0;
              return (
                <View key={b.bucketStart} style={[styles.statsHistoryCol, { width: colWidth }]}>
              <Text style={[styles.statsHistoryValue, { color, width: colWidth }]} numberOfLines={1}>
                {fmtHistoryValue(habit, b.total)}
              </Text>
              <View style={styles.statsHistoryBarTrack}>
                {pct > 0 &&
                  (b.partial ? (
                    <View style={[styles.statsHistoryBar, { height: `${pct}%`, backgroundColor: color + '33' }]} />
                  ) : (
                    <LinearGradient
                      colors={[color, color + '66']}
                      style={[styles.statsHistoryBar, { height: `${pct}%` }]}
                    />
                  ))}
              </View>
              <Text style={styles.statsHistoryLabel}>
                {historyBarLabel(period, b.bucketStart, i > 0 ? buckets[i - 1].bucketStart : null, lang)}
              </Text>
            </View>
          );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function HabitDarkStatsCard({
  stats,
  habit,
  color,
  themeColors,
  lang,
  t,
  styles,
}: {
  stats: HabitStats;
  habit: Habit;
  color: string;
  themeColors: Colors;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  styles: Styles;
}) {
  const GOAL_LABEL_KEY: Record<GoalPeriodStat['key'], string> = {
    today: 'stats.goalToday',
    week: 'stats.goalWeek',
    month: 'stats.goalMonth',
    quarter: 'stats.goalQuarter',
    year: 'stats.goalYear',
  };

  const [scorePeriod, setScorePeriod] = useState<ChartPeriod>('day');
  const [historyPeriod, setHistoryPeriod] = useState<ChartPeriod>('week');

  // Grafik artık yatayda kaydırılabilir (bkz. ScoreLineChart) — mevcut TÜM
  // kova gösterilir, ekrana sığmayan kısım kaydırarak görülür; ayrı bir
  // pencere kırpması gerekmiyor.
  const scoreBuckets = stats.series ? stats.series[scorePeriod] : [];
  const scoreUnit = t(PERIOD_UNIT_KEY[scorePeriod]);
  // Etiket: sadece gün numarası, ay değiştiğinde bir kez ay adı da eklenir
  // (historyBarLabel ile AYNI mantık — "Geçmiş" çubuklarındaki desenin aynısı,
  // kullanıcı isteği: her noktada ayı tekrar etmesin, kalabalık olmasın).
  const scorePoints = scoreBuckets.map((b, i) => ({
    value: b.score,
    label: historyBarLabel(scorePeriod, b.date, i > 0 ? scoreBuckets[i - 1].date : null, lang),
    partial: b.partial,
  }));

  const historyBuckets = stats.historyTotals ? stats.historyTotals[historyPeriod] : [];

  if (stats.goalPeriods.length === 0 && !stats.series && !stats.historyTotals) return null;

  return (
    <View style={styles.statsCard}>
      {stats.goalPeriods.length > 0 && (
        <View style={styles.statsSection}>
          <Text style={styles.statsEyebrow}>{t('stats.goalTitle')}</Text>
          <View style={{ gap: 14, marginTop: 4 }}>
            {stats.goalPeriods.map((p) => {
              const pct = p.goal > 0 ? Math.min(100, (p.done / p.goal) * 100) : 0;
              return (
                <View key={p.key}>
                  <View style={styles.statsGoalHeadRow}>
                    <Text style={styles.statsGoalLabel}>{t(GOAL_LABEL_KEY[p.key])}</Text>
                    <Text style={styles.statsGoalValue}>
                      {fmtGoalValue(habit, p.done)} / {fmtGoalValue(habit, p.goal)}
                    </Text>
                  </View>
                  <View style={styles.statsGoalTrack}>
                    <View style={[styles.statsGoalFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {stats.series && (
        <View style={[styles.statsSection, styles.statsSectionBordered]}>
          <View style={styles.statsHeadRow}>
            <Text style={styles.statsTitle}>{t('stats.scoreTitle')}</Text>
            <Text style={styles.statsMeta}>{t('stats.scoreWindow', { n: scoreBuckets.length, unit: scoreUnit })}</Text>
          </View>
          <PeriodTabs period={scorePeriod} onChange={setScorePeriod} t={t} styles={styles} />
          {scoreBuckets.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <ScoreLineChart
                points={scorePoints}
                color={color}
                gridColor={themeColors.line}
                labelColor={themeColors.faint}
                variant="step"
              />
            </View>
          )}
        </View>
      )}

      {stats.historyTotals && (
        <View style={[styles.statsSection, styles.statsSectionBordered]}>
          <View style={styles.statsHeadRow}>
            <Text style={styles.statsTitle}>{t('stats.historyTitle')}</Text>
          </View>
          <PeriodTabs period={historyPeriod} onChange={setHistoryPeriod} t={t} styles={styles} />
          {historyBuckets.length > 0 && (
            <HistoryBars
              buckets={historyBuckets}
              period={historyPeriod}
              habit={habit}
              color={color}
              lang={lang}
              styles={styles}
            />
          )}
        </View>
      )}
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

// Seri geçmişi: en uzundan en kısaya İLK 3 seri, her satırda uzunluk + tarih
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
  const top = streaks.slice(0, 3);
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

            {/* Hedef/Puan/Geçmiş — tek koyu kart (Claude Design mockup'ının portu, bkz. HabitDarkStatsCard). */}
            <View style={{ marginTop: 12 }}>
              <HabitDarkStatsCard
                stats={stats}
                habit={stats.habit}
                color={habitColor}
                themeColors={colors}
                lang={lang}
                t={t}
                styles={styles}
              />
            </View>


            {/* Seri geçmişi — en uzun 3 seri. Kalan bölümler (bu ve altındakiler)
                de kendi `styles.card` kutusunda — ekrandaki tüm istatistik
                blokları artık TUTARLI şekilde kutulu/ayrık (bkz. dosya başı yorumu). */}
            {stats.streaks.length > 0 && (
              <View style={[styles.card, { marginTop: 12 }]}>
                <Text style={styles.cardLabel}>{t('stats.streakHistory')}</Text>
                <View style={{ marginTop: 12 }}>
                  <StreakList
                    streaks={stats.streaks}
                    color={habitColor}
                    lang={lang}
                    t={t}
                    suffixKey={isQuota ? 'stats.weeksSuffix' : 'stats.daysSuffix'}
                    styles={styles}
                  />
                </View>
              </View>
            )}

            {/* Tam takvim — ay ay gezinilebilir. */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardLabel}>{t('stats.calendar')}</Text>
              <View style={[styles.calHead, { marginTop: 12 }]}>
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
            </View>

            {/* Rozetler — en uzun seri eşiği geçtiyse kazanılmış sayılır (seri
                düşse bile madalya kalır). Kilitliler soluk. */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardLabel}>{t('stats.badges')}</Text>
              <View style={[styles.badgeRow, { marginTop: 12 }]}>
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

    // — Gün/Hafta/Ay sekmeleri (Puan + Geçmiş paylaşır) —
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

    // — Hedef/Puan/Geçmiş kartı — Claude Design mockup'ının (Tur 9, kart 9a)
    // DÜZEN/YAPI portu. Renkler İSE mockup'tan sabit kopyalanmadı, uygulamanın
    // kendi tema tokenlerinden (c.*) gelir — aksi halde bu bölüm açık/koyu tema
    // değişse de hep aynı donuk siyah kalır, ekrana yapıştırılmış bir görsel
    // gibi durur (kullanıcı geri bildirimi: "fotoğraf gibi durdu"). Koyu temada
    // (özellikle "Tam Siyah" stilinde, bkz. theme.ts blackColors) zaten mockup'a
    // çok yakın bir görünüm veriyor — ama artık GERÇEKTEN kodlanmış, dondurulmuş
    // bir asset değil.
    statsCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    statsSection: { padding: 20 },
    statsSectionBordered: { borderTopWidth: 1, borderTopColor: c.border },
    statsEyebrow: { color: c.faint, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
    statsGoalHeadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    statsGoalLabel: { color: c.muted, fontSize: 11, fontWeight: '600' },
    statsGoalValue: { color: c.text, fontSize: 11, fontWeight: '600' },
    statsGoalTrack: { height: 1, backgroundColor: c.border },
    statsGoalFill: { position: 'absolute', left: 0, top: -1, height: 3, backgroundColor: c.text, borderRadius: 1.5 },
    statsHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    statsPeriodRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
    statsPeriodBtn: { paddingHorizontal: 10, paddingVertical: 5 },
    statsTitle: { color: c.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
    statsMeta: { color: c.faint, fontSize: 11, fontWeight: '600' },
    statsHistoryRow: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 4 },
    statsHistoryCol: { height: '100%', alignItems: 'center' },
    statsHistoryValue: { fontSize: 8, fontWeight: '600', marginBottom: 6 },
    statsHistoryBarTrack: { flex: 1, width: '65%', justifyContent: 'flex-end' },
    statsHistoryBar: { width: '100%', borderRadius: 6, minHeight: 4 },
    statsHistoryLabel: { fontSize: 7, fontWeight: '600', color: c.faint, marginTop: 6 },
  });
