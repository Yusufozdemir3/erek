// Alışkanlık istatistik ekranı — özet sayılar, Hedef/Puan/Geçmiş kartı,
// seri geçmişi (ilk 3), aylık takvim + en altta rozetler.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.

import { useEffect, useRef, useState } from 'react';
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
} from '@/ui/useHabitStats';
import { useHabitCalendar, type CalendarDay } from '@/ui/useHabitCalendar';
import { ScoreLineChart } from '@/ui/ScoreLineChart';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR, type Colors } from '@/ui/theme';
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
// Ekrana AYNI ANDA kaç kova sığar. Sütun genişliği bundan türer: eskiden tüm
// kovalar sığdırılmaya çalışılıyordu (13-14 çubuk yan yana) ve grafik okunmaz
// derecede kalabalıklaşıyordu (kullanıcı geri bildirimi). Kalan kovalar
// KAYBOLMAZ — yatay kaydırmayla gelirler, açılışta en güncel uçta durulur.
const HISTORY_VISIBLE_COLS = 7;
// Çubuk alanı ölçüleri. statsHistoryRow/Label stilleri de bunlardan türer ki
// çubuk yüksekliğini burada PİKSEL olarak hesaplayabilelim (yüzde değil) —
// değer yazısının çubuğa sığıp sığmadığına ancak öyle karar verilebiliyor.
const HISTORY_ROW_H = 190;
const HISTORY_LABEL_H = 16;
const HISTORY_LABEL_GAP = 6;
const HISTORY_TRACK_H = HISTORY_ROW_H - HISTORY_LABEL_H - HISTORY_LABEL_GAP;
// Değer yazısı çubuğun İÇİNDE ve YATAY. Bir ara 90° döndürülmüştü: sütun 26px
// iken sayı çubuğa yatay sığmıyordu. HISTORY_VISIBLE_COLS=7 ile sütun ~50px'e,
// çubuk ~33px'e çıkınca ("18.3k" ≈ 22px) döndürmeye gerek kalmadı — yatay yazı
// hem okunaklı hem de dikeydeki "yazı çubuktan uzun" sorununu tamamen bitirdi:
// artık sığma koşulu yazının UZUNLUĞU değil, tek satır yüksekliği.
const HISTORY_VALUE_LINE = 12; // yazı satırının yüksekliği
const HISTORY_VALUE_INSET = 4; // içeri yazarken çubuğun tepesinden boşluk
// Bu boydan kısa çubukta satır içeri sığmaz, yazı çubuğun ÜSTÜNE çıkar.
const HISTORY_VALUE_MIN_BAR = HISTORY_VALUE_LINE + HISTORY_VALUE_INSET * 2;

// Çubuğun İÇİNE yazılan değerin mürekkep rengi: alışkanlık rengi kullanıcı
// seçimi olduğu için sabit koyu/açık yazı her palette okunmuyor — zeminin
// parlaklığına göre seçilir (BT.601).
function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#0a0a0a';
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0a0a0a' : '#ffffff';
}

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
  // Periyot (Gün/Hafta/Ay) değişince bileşen yeniden mount olmadığı için bayrak
  // açık kalıyor ve "en güncel veri sağda" otomatik kaydırması atlanıyordu —
  // kullanıcı sekmeye basınca 30 kovanın EN ESKİsine bakıyordu. Aynı düzeltme
  // Puan grafiğinde de var (bkz. ScoreLineChart).
  useEffect(() => {
    didAutoScroll.current = false;
  }, [period, buckets.length]);
  const [containerWidth, setContainerWidth] = useState(0);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  // Sütun genişliği: ekranı HISTORY_VISIBLE_COLS kovaya böl. Kova sayısı bundan
  // AZSA (ör. sadece 4 hafta) mevcut kovalar konteyneri doldurur — aksi halde
  // çubuklar sol kenara yapışıp sağda çirkin bir boşluk bırakıyordu (Puan
  // grafiğindeki aynı düzeltme, bkz. ScoreLineChart).
  const colWidth = containerWidth > 0 ? containerWidth / Math.min(buckets.length, HISTORY_VISIBLE_COLS) : 0;

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
              // Değer yazısı çubuğun İÇİNDE, tepeye yakın (kullanıcı isteği:
              // "miktarlar kolonların içinde yazsa"). Çubuk bir satır sığdıramayacak
              // kadar kısaysa yazı çubuğun ÜSTÜNE çıkar.
              const barH = (HISTORY_TRACK_H * pct) / 100;
              const inside = barH >= HISTORY_VALUE_MIN_BAR;
              const valueTop = inside
                ? HISTORY_TRACK_H - barH + HISTORY_VALUE_INSET
                : HISTORY_TRACK_H - barH - HISTORY_VALUE_INSET - HISTORY_VALUE_LINE;
              return (
                <View key={b.bucketStart} style={[styles.statsHistoryCol, { width: colWidth }]}>
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
              <Text
                style={[
                  styles.statsHistoryValue,
                  {
                    width: colWidth,
                    top: valueTop,
                    // Çubuğun üstünde zemin alışkanlık rengi; dışarıda ve soluk
                    // (partial) çubukta zemin kartın kendisi.
                    color: inside && !b.partial ? inkOn(color) : color,
                  },
                ]}
                numberOfLines={1}
              >
                {fmtHistoryValue(habit, b.total)}
              </Text>
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
              />
            </View>
          )}
        </View>
      )}

      {/* Puan KİLİTLİ: alışkanlık SCORE_MIN_DAYS günden az yaşadı. Sayı burada
          matematiksel olarak doğru olurdu ama anlamlı olmazdı (birkaç günlük
          veriden "puan" çıkarmak bugünü tekrar etmektir) — yanlış bir sayı
          göstermektense geri sayım gösteriyoruz. Bkz. useHabitStats. */}
      {!stats.series && stats.scoreUnlockInDays != null && (
        <View style={[styles.statsSection, styles.statsSectionBordered]}>
          <View style={styles.statsHeadRow}>
            <Text style={styles.statsTitle}>{t('stats.scoreTitle')}</Text>
          </View>
          <Text style={[styles.statsMeta, { marginTop: 8 }]}>
            {t('stats.scoreLocked', { n: stats.scoreUnlockInDays })}
          </Text>
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
  // Kazanılan rozetler + sıradaki eşik. İlerleme 0'dan sıradaki eşiğe göre
  // ölçülür (bir önceki eşikten değil): "kalan gün" sayısıyla aynı doğrusal
  // ölçek, çubuk ile yazı birbirini doğruluyor.
  const earnedBadges = STREAK_MILESTONES.filter((m) => streakDays >= m.days);
  const nextBadge = STREAK_MILESTONES.find((m) => streakDays < m.days) ?? null;
  const badgePct = nextBadge ? Math.min(100, Math.round((streakDays / nextBadge.days) * 100)) : 100;
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
              {/* "Tamamlanma %" KALDIRILDI: ömür boyu ortalama olduğu için
                  alışkanlık yaşlandıkça donuyordu (iyi de kötü de bir hafta
                  sayıyı kıpırdatmıyor) — Puan kartındaki EMA aynı soruya trendle
                  cevap veriyor, ikisi yan yana kafa karıştırıyordu. */}
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

            {/* "Seri geçmişi" (en uzun 3 seri) KALDIRILDI: üstteki özet zaten
                güncel + en uzun seriyi veriyordu, bölüm yalnız 2. ve 3. en uzunu
                ekliyordu; hemen altındaki Takvim aynı geçmişi çok daha zengin
                gösteriyor. Kalan bölümler kendi `styles.card` kutusunda — ekrandaki
                istatistik blokları TUTARLI şekilde kutulu/ayrık. */}

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
                düşse bile madalya kalır). Eskiden 4 eşiğin TAMAMI vitrindeydi,
                kilitliler soluk: içerik üstteki "En uzun seri" sayısından zaten
                türetilebiliyordu ve yeni kullanıcıyı 4 soluk madalya karşılıyordu.
                Artık yalnız kazanılanlar + SIRADAKİ eşik ilerleme çubuğuyla —
                mesaj "yapmadıkların"dan "az kaldı"ya döndü (aynı ekrandaki Hedef
                kartının dili). */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardLabel}>{t('stats.badges')}</Text>
              {earnedBadges.length > 0 && (
                <View style={[styles.badgeRow, { marginTop: 12 }]}>
                  {earnedBadges.map((m) => (
                    <View key={m.days} style={styles.badge}>
                      <Text style={styles.badgeEmoji}>{m.emoji}</Text>
                      <Text style={styles.badgeLabel}>{t(m.labelKey)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {nextBadge ? (
                <View style={{ marginTop: 12 }}>
                  <View style={styles.badgeNextRow}>
                    <Text style={styles.badgeNextEmoji}>{nextBadge.emoji}</Text>
                    <Text style={styles.badgeNextLabel}>{t(nextBadge.labelKey)}</Text>
                    <Text style={styles.badgeNextLeft}>
                      {t('date.daysLeft', { n: nextBadge.days - streakDays })}
                    </Text>
                  </View>
                  <View style={styles.badgeTrack}>
                    <View style={[styles.badgeFill, { width: `${badgePct}%`, backgroundColor: habitColor }]} />
                  </View>
                </View>
              ) : (
                <Text style={[styles.badgeAllEarned, { marginTop: 12 }]}>{t('stats.badgesAllEarned')}</Text>
              )}
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
    // Yalnız KAZANILAN rozetler madalya olarak dizilir (kilitli vitrin kalktı).
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    badge: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    badgeEmoji: { fontSize: 24 },
    badgeLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
    // — Sıradaki rozet: emoji + ad + kalan gün, altında ilerleme çubuğu —
    badgeNextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badgeNextEmoji: { fontSize: 16, opacity: 0.5 },
    badgeNextLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    badgeNextLeft: { fontSize: 12, fontWeight: '600', color: c.muted },
    badgeTrack: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden', marginTop: 8 },
    badgeFill: { height: '100%', borderRadius: 3 },
    badgeAllEarned: { fontSize: 13, fontWeight: '700', color: c.text },

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
    // ÖLÇEK: Puan grafiğiyle (ScoreLineChart) AYNI orana çekildi — eski değerler
    // (120px sıra, 8/7px yazı) telefonda okunmuyordu ve Puan büyütülünce iki kart
    // yan yana dengesiz duruyordu (kullanıcı geri bildirimi). Ölçüler HISTORY_*
    // sabitlerinden gelir; çubuk yüksekliği orada piksel olarak hesaplanıyor.
    statsHistoryRow: { flexDirection: 'row', alignItems: 'flex-end', height: HISTORY_ROW_H, marginTop: 4 },
    statsHistoryCol: { height: '100%', alignItems: 'center' },
    // Genişlik/konum/renk çizim sırasında veriliyor (sütun ve çubuk boyuna bağlı).
    statsHistoryValue: {
      position: 'absolute',
      left: 0,
      height: HISTORY_VALUE_LINE,
      lineHeight: HISTORY_VALUE_LINE,
      fontSize: 9,
      fontWeight: '700',
      textAlign: 'center',
    },
    statsHistoryBarTrack: { flex: 1, width: '65%', justifyContent: 'flex-end' },
    statsHistoryBar: { width: '100%', borderRadius: 6, minHeight: 4 },
    statsHistoryLabel: {
      fontSize: 10,
      lineHeight: HISTORY_LABEL_H,
      fontWeight: '600',
      color: c.faint,
      marginTop: HISTORY_LABEL_GAP,
    },
  });
