// Alışkanlık istatistik ekranının veri yükleme mantığı: özet sayılar
// (güncel/en uzun seri, tamamlanma oranı, toplam miktar), gün/hafta/ay
// tamamlama serileri (çubuk grafik) ve seri geçmişi.
// Hepsi logsInRange/allLogs sorgularından türetilir.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit, HabitLog } from '@/db';
import {
  diffDays,
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  todayDate,
  toYmd,
  weekStartOf,
} from '@/lib/helpers';
import { buildHabitInsights, type HabitInsight } from '@/lib/habitInsights';

const WINDOW_DAYS = 90;
const DAY_BUCKETS = 30;
const WEEK_BUCKETS = 12;
const MONTH_BUCKETS = 12;
// Puan (EMA) ISINMA penceresi — gösterilecek aralıktan ÖNCE, yalnızca EMA'yı
// beslemek için ekstra kova. Bunlar ekranda görünmez, yalnız ilk görünür
// noktanın da öncesindeki birikimi yansıtmasını sağlar (bkz. attachScores).
const DAY_WARMUP = 60;
const WEEK_WARMUP = 12;
const MONTH_WARMUP = 12;
// EMA (üstel hareketli ortalama) katsayısı — her kova hedefe ulaşınca puan
// biraz YÜKSELİR, ıskalanınca biraz DÜŞER; tek kötü/iyi kova grafiği sıçratmaz.
// 0.2 tek günün etkisini fazla hissettiriyordu (kullanıcı geri bildirimi) —
// 0.07'ye düşürüldü.
const SCORE_EMA_ALPHA = 0.07;
function emaScores(ratios: number[], alpha = SCORE_EMA_ALPHA): number[] {
  const out: number[] = [];
  let prev = 0;
  ratios.forEach((r, i) => {
    prev = i === 0 ? r : prev * (1 - alpha) + r * alpha;
    out.push(prev);
  });
  return out;
}

// Seri geçmişi (habitRepo.allStreaks'in aynısı — burada yalnız tip takma adı).
export interface StreakEntry {
  length: number;
  start: string;
  end: string;
}

// Grafik kovası: date = kovanın başlangıç günü ("YYYY-MM-DD"), ratio = 0..1
// (o kovanın HAM tamamlanma oranı), score = aynı kovanın EMA'lı (yumuşatılmış)
// puanı — Puan grafiği bunu çizer. partial=true ise kova henüz BİTMEDİ
// (bugün / süren hafta-ay) — grafikte soluk gösterilir (bkz. ScoreLineChart).
export interface ChartBucket {
  date: string;
  ratio: number;
  score: number;
  partial: boolean;
}

// Gün/hafta/ay serileri — istatistik ekranındaki çubuk grafiğin üç görünümü.
export interface HabitChartSeries {
  day: ChartBucket[];
  week: ChartBucket[];
  month: ChartBucket[];
}

// "Hedef" karşılaştırması: içinde bulunulan gün/hafta/ay/yıl için TAM dönem
// hedefi (gelecek günler dahil, "bu dönemi hep yapsaydın ne olurdu") ile
// bugüne kadar biriken miktar. Kota alışkanlıkta 'today' satırı anlamsız
// (tek günlük hedef yok) — buildGoalPeriods onu eler.
export interface GoalPeriodStat {
  key: 'today' | 'week' | 'month' | 'quarter' | 'year';
  done: number;
  goal: number;
}

// "Geçmiş" kartındaki bir kova (gün/hafta/ay) toplamı — yalnız nicel/zamanlayıcı
// (target_amount'lı) alışkanlıkta anlamlı (ikilide "toplam miktar" kavramı yok).
// partial=true ise kova ya bugünden/bu aydan önce hiç veri yokken başlıyor
// (alışkanlığın ilk kovası) ya da hâlâ devam ediyor (henüz bitmedi) — UI bunu
// soluk gösterir.
export interface BucketTotal {
  bucketStart: string;
  total: number;
  partial: boolean;
}

// "Geçmiş" kartının Gün/Hafta/Ay seçenekleri — CompletionChart'taki aynı üçlü
// periyot deseni, ama oran değil GERÇEK TOPLAM miktar taşır.
export interface HistoryTotals {
  day: BucketTotal[];
  week: BucketTotal[];
  month: BucketTotal[];
}

export interface HabitStats {
  habit: Habit | null;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;      // 0..1, yalnızca planlı günler üzerinden
  scheduledCount: number;
  completedCount: number;
  totalAmount: number | null;  // nicel değilse (target_amount yoksa) null
  streaks: StreakEntry[];       // büyükten küçüğe geçmiş seriler
  series: HabitChartSeries | null; // hiç log yoksa null (grafik gizlenir)
  goalPeriods: GoalPeriodStat[]; // Bugün/Hafta/Ay/3 Ay/Yıl hedef karşılaştırması
  insights: HabitInsight[]; // kural tabanlı gözlemler (bkz. habitInsights.ts) — en fazla 2
  historyTotals: HistoryTotals | null; // "Geçmiş" kartı — yalnız nicel/zamanlayıcıda dolu
}

const EMPTY: HabitStats = {
  habit: null,
  currentStreak: 0,
  longestStreak: 0,
  completionRate: 0,
  scheduledCount: 0,
  completedCount: 0,
  totalAmount: null,
  streaks: [],
  series: null,
  goalPeriods: [],
  insights: [],
  historyTotals: null,
};

// Grafikler artık yatayda kaydırılabilir (bkz. habit/[id].tsx) — ekrana sığan
// sayı azaldı ama kaydırarak ulaşılabilen aralık genişledi.
const HISTORY_BUCKETS = 30;

// "Geçmiş" kartının Gün/Hafta/Ay toplamları — yalnız target_amount'lı (nicel/
// zamanlayıcı) alışkanlıkta anlamlı. Her periyotta son 5 kova (kalabalık
// olmasın, değer etiketleri sığsın diye — bkz. habit/[id].tsx HabitDarkStatsCard).
function buildHistoryTotals(habit: Habit, allLogs: HabitLog[], today: string): HistoryTotals | null {
  if (habit.target_amount == null || allLogs.length === 0) return null;
  const amountByDate = new Map(allLogs.map((l) => [l.log_date, l.amount ?? 0]));
  const firstLogDate = allLogs[0].log_date;

  const sumRange = (startYmd: string, endYmd: string): number => {
    let total = 0;
    const cursor = new Date(`${startYmd}T00:00:00`);
    const end = new Date(`${endYmd}T00:00:00`);
    while (cursor <= end) {
      total += amountByDate.get(toYmd(cursor)) ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  };

  // — Gün: son 5 gün —
  const day: BucketTotal[] = lastDays(HISTORY_BUCKETS).map((ymd) => ({
    bucketStart: ymd,
    total: amountByDate.get(ymd) ?? 0,
    partial: ymd === today || ymd < firstLogDate,
  }));

  // — Hafta: son 5 hafta (Pazartesi başlangıçlı) —
  const monday = new Date(`${today}T00:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // bu haftanın pazartesisi
  const week: BucketTotal[] = [];
  for (let i = HISTORY_BUCKETS - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    week.push({
      bucketStart: startYmd,
      total: sumRange(startYmd, endYmd),
      partial: endYmd > today || startYmd < firstLogDate,
    });
  }

  // — Ay: son 5 takvim ayı —
  const now = new Date(`${today}T00:00:00`);
  const month: BucketTotal[] = [];
  for (let i = HISTORY_BUCKETS - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    month.push({
      bucketStart: startYmd,
      total: sumRange(startYmd, endYmd),
      partial: endYmd > today || startYmd < firstLogDate,
    });
  }

  return { day, week, month };
}

// Bir günün 0..1 tamamlama oranı: ikili alışkanlıkta 0/1; nicel/zamanlayıcıda
// yapılan miktarın hedefe oranı (1'de kırpılır — hedefi aşmak grafiği taşırmaz).
function dayRatio(habit: Habit, log: HabitLog | undefined): number {
  if (!log) return 0;
  if (habit.target_amount != null && habit.target_amount > 0) {
    return Math.min(1, (log.amount ?? 0) / habit.target_amount);
  }
  return log.completed === 1 ? 1 : 0;
}

// İki tarih (dahil) arasındaki planlı gün / tamamlanan gün oranı.
// Gelecek günler sayılmaz (henüz yaşanmadı); planlı gün yoksa 0.
// KOTA (haftada X kez) kuralında payda gün başına kota/7'dir — tam bir haftada
// tam kota, kısmi aralıkta oransal (hafta sınırı gözetmeyen yaklaşıklık).
function rangeRatio(
  habit: Habit,
  completedSet: Set<string>,
  startYmd: string,
  endYmd: string,
  today: string
): number {
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;
  let scheduled = 0;
  let done = 0;
  let quotaDays = 0;
  const cursor = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (ymd > today) break;
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
      if (quota) quotaDays++;
      else scheduled++;
      if (completedSet.has(ymd)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (quota) {
    const expected = (quota * quotaDays) / 7;
    return expected > 0 ? Math.min(1, done / expected) : 0;
  }
  return scheduled > 0 ? done / scheduled : 0;
}

// Serinin başındaki, alışkanlığın doğumundan (ilk log / start_date) tümüyle
// önce biten boş kovaları at — yeni bir alışkanlıkta 10 ay boş çubuk gösterme.
function trimLeading(buckets: ChartBucket[], bucketEndOf: (b: ChartBucket) => string, firstDate: string): ChartBucket[] {
  let i = 0;
  while (i < buckets.length - 1 && bucketEndOf(buckets[i]) < firstDate) i++;
  return buckets.slice(i);
}

function buildSeries(habit: Habit, allLogs: HabitLog[]): HabitChartSeries | null {
  if (allLogs.length === 0) return null;
  const today = todayDate();
  const logByDate = new Map(allLogs.map((l) => [l.log_date, l]));
  const completedSet = new Set(allLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
  const firstLogDate = allLogs[0].log_date;
  const firstDate = habit.start_date && habit.start_date < firstLogDate ? habit.start_date : firstLogDate;
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;

  // — Gün: kova = tek gün. KOTA (haftada X kez) alışkanlıkta günün HAM 0/1
  // durumu yerine "bu haftanın bugüne kadarki oranı" kullanılır — aksi halde
  // haftalık kotasını tutturan bir alışkanlık bile Gün sekmesinde sürekli
  // düşük puanlı görünürdü (Hafta/Ay sekmeleriyle çelişen, yanıltıcı bir
  // görünüm — kullanıcı geri bildirimi).
  const dayDates = lastDays(DAY_BUCKETS + DAY_WARMUP);
  const dayRaw: ChartBucket[] = dayDates.map((date) => {
    const ratio = quota
      ? rangeRatio(habit, completedSet, weekStartOf(date), date, today)
      : isScheduledOn(habit.schedule, date) && isWithinHabitDates(habit.start_date, habit.end_date, date)
        ? dayRatio(habit, logByDate.get(date))
        : 0;
    return { date, ratio, score: 0, partial: date === today };
  });

  // — Hafta: kova = hafta (Pazartesi başlangıçlı) —
  const weekRaw: ChartBucket[] = [];
  const monday = new Date(`${today}T00:00:00`);
  const jsDay = monday.getDay(); // 0=Pazar
  monday.setDate(monday.getDate() - ((jsDay + 6) % 7)); // bu haftanın pazartesisi
  for (let i = WEEK_BUCKETS + WEEK_WARMUP - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    weekRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  // — Ay: kova = takvim ayı —
  const monthRaw: ChartBucket[] = [];
  const now = new Date(`${today}T00:00:00`);
  for (let i = MONTH_BUCKETS + MONTH_WARMUP - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // ayın son günü
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    monthRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  // EMA, ISINMA penceresi dahil TÜM ham diziler üzerinden hesaplanır, sonra
  // yalnızca gösterilecek son kısım kesilir — grafiğin ilk görünür noktası da
  // öncesindeki birikimi yansıtır, Gün/Hafta/Ay sekmeleri arasında puan
  // "sıfırlanmış" gibi görünmez (kullanıcı geri bildirimi).
  const attachScores = (raw: ChartBucket[]): ChartBucket[] => {
    const scores = emaScores(raw.map((b) => b.ratio));
    return raw.map((b, i) => ({ ...b, score: scores[i] }));
  };

  const day = attachScores(dayRaw).slice(-DAY_BUCKETS);
  const week = attachScores(weekRaw).slice(-WEEK_BUCKETS);
  const month = attachScores(monthRaw).slice(-MONTH_BUCKETS);

  const endOfDay = (b: ChartBucket) => b.date;
  const endOfWeek = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return toYmd(d);
  };
  const endOfMonth = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };

  return {
    day: trimLeading(day, endOfDay, firstDate),
    week: trimLeading(week, endOfWeek, firstDate),
    month: trimLeading(month, endOfMonth, firstDate),
  };
}

// Dönemin TAM (gelecek dahil) başlangıç/bitiş günü — bugünün içinde bulunduğu
// gün/hafta/ay/yıl. Kota alışkanlıkta 'today' zaten üretilmez (bkz. çağıran).
function goalPeriodBounds(today: string): { key: GoalPeriodStat['key']; start: string; end: string }[] {
  const weekStart = weekStartOf(today);
  const weekEndD = new Date(`${weekStart}T00:00:00`);
  weekEndD.setDate(weekEndD.getDate() + 6);
  const t = new Date(`${today}T00:00:00`);
  const monthStart = toYmd(new Date(t.getFullYear(), t.getMonth(), 1));
  const monthEnd = toYmd(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  // "3 Ay": içinde bulunulan takvim çeyreği (Oca-Mar/Nis-Haz/Tem-Eyl/Eki-Ara) —
  // yılın diğer dönemleriyle aynı "sabit takvim aralığı" mantığını korur.
  const qStartMonth = Math.floor(t.getMonth() / 3) * 3;
  const quarterStart = toYmd(new Date(t.getFullYear(), qStartMonth, 1));
  const quarterEnd = toYmd(new Date(t.getFullYear(), qStartMonth + 3, 0));
  return [
    { key: 'today', start: today, end: today },
    { key: 'week', start: weekStart, end: toYmd(weekEndD) },
    { key: 'month', start: monthStart, end: monthEnd },
    { key: 'quarter', start: quarterStart, end: quarterEnd },
    { key: 'year', start: `${t.getFullYear()}-01-01`, end: `${t.getFullYear()}-12-31` },
  ];
}

// Her dönem için: goal = dönemin TÜM planlı günlerinin hedefi (gelecek dahil,
// "bu dönemi hep yapsaydın"), done = bugüne kadar biriken gerçek miktar.
// Kota (haftada X kez) her gün "müsait" sayıldığından planlı-gün filtresi
// uygulanmaz, hedef haftalık kotadan dönem uzunluğuna oranlanır.
function buildGoalPeriods(habit: Habit, allLogs: HabitLog[], today: string): GoalPeriodStat[] {
  const logByDate = new Map(allLogs.map((l) => [l.log_date, l]));
  const perDayTarget = habit.target_amount ?? 1;
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;
  const amountOf = (ymd: string): number => {
    const log = logByDate.get(ymd);
    if (!log) return 0;
    return habit.target_amount != null ? log.amount ?? 0 : log.completed === 1 ? 1 : 0;
  };

  return goalPeriodBounds(today)
    .filter((b) => !(quota && b.key === 'today'))
    .map(({ key, start, end }) => {
      let done = 0;
      let goal = 0;
      const doneEnd = end < today ? end : today;
      if (quota) {
        goal = ((quota * (diffDays(start, end) + 1)) / 7) * perDayTarget;
      }
      if (start <= doneEnd) {
        const cursor = new Date(`${start}T00:00:00`);
        const endD = new Date(`${end}T00:00:00`);
        const doneEndD = new Date(`${doneEnd}T00:00:00`);
        while (cursor <= endD) {
          const ymd = toYmd(cursor);
          if (quota) {
            if (cursor <= doneEndD) done += amountOf(ymd);
          } else if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
            goal += perDayTarget;
            if (cursor <= doneEndD) done += amountOf(ymd);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      return { key, done, goal };
    });
}

export function useHabitStats(habitId: string): HabitStats {
  const [stats, setStats] = useState<HabitStats>(EMPTY);

  const reload = useCallback(() => {
    const habit = habitRepo.getById(habitId);
    if (!habit) {
      setStats(EMPTY);
      return;
    }

    const dates = lastDays(WINDOW_DAYS);
    const logs = habitRepo.logsInRange(habitId, dates[0]);
    const completedDates = new Set(logs.filter((l) => l.completed === 1).map((l) => l.log_date));

    // Planlı gün sayımı (tamamlanma oranı için). Aralık dışı (başlangıçtan önce /
    // bitişten sonra) günler planlı sayılmaz, orana girmez.
    let scheduledCount = 0;
    let completedCount = 0;
    for (const date of dates) {
      const scheduled =
        isScheduledOn(habit.schedule, date) &&
        isWithinHabitDates(habit.start_date, habit.end_date, date);
      if (scheduled) {
        scheduledCount++;
        if (completedDates.has(date)) completedCount++;
      }
    }
    // KOTA kuralında "her gün müsait" olduğu için gün bazlı payda yanıltır —
    // oran, pencere üzerindeki oransal kota beklentisine göre hesaplanır.
    const quotaRate = isQuotaSchedule(habit.schedule)
      ? Math.min(1, completedCount / Math.max(1, (habit.schedule!.timesPerWeek! * scheduledCount) / 7))
      : null;

    const totalAmount =
      habit.target_amount != null ? logs.reduce((sum, l) => sum + (l.amount ?? 0), 0) : null;

    const allLogs = habitRepo.allLogs(habitId);
    const currentStreak = habitRepo.currentStreak(habitId);
    const longestStreak = habitRepo.longestStreak(habitId);

    setStats({
      habit,
      currentStreak,
      longestStreak,
      completionRate: quotaRate ?? (scheduledCount > 0 ? completedCount / scheduledCount : 0),
      scheduledCount,
      completedCount,
      totalAmount,
      streaks: habitRepo.allStreaks(habitId),
      series: buildSeries(habit, allLogs),
      goalPeriods: buildGoalPeriods(habit, allLogs, todayDate()),
      insights: buildHabitInsights(habit, allLogs, todayDate(), currentStreak, longestStreak),
      historyTotals: buildHistoryTotals(habit, allLogs, todayDate()),
    });
  }, [habitId]);

  useFocusEffect(reload);

  return stats;
}
