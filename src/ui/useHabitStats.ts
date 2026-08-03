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
import { buildSeries, type HabitChartSeries } from '@/lib/habitSeries';

// Puan grafiğinin veri üretimi ve tipleri lib/habitSeries.ts'e taşındı (saf
// mantık, React'siz — testleri hızlı 'logic' projesinde koşsun diye). Ekranlar
// bu tipleri buradan import etmeye devam edebilsin diye yeniden dışa açılıyor.
export type { ChartBucket, HabitChartSeries } from '@/lib/habitSeries';

const WINDOW_DAYS = 90;

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
  totalAmount: number | null;  // nicel değilse (target_amount yoksa) null
  // NOT: completionRate/scheduledCount/completedCount ve streaks KALDIRILDI —
  // ömür boyu tamamlanma oranı Puan kartındaki EMA'nın kör bir kopyasıydı, seri
  // geçmişi listesi de ekrandan çıktı (bkz. app/habit/[id].tsx). İkisinin de tek
  // tüketicisi o ekrandı; alan kalsaydı her yüklemede boşa sorgu/döngü olurdu.
  series: HabitChartSeries | null; // hiç log yoksa null
  goalPeriods: GoalPeriodStat[]; // Bugün/Hafta/Ay/3 Ay/Yıl hedef karşılaştırması
  historyTotals: HistoryTotals | null; // "Geçmiş" kartı — yalnız nicel/zamanlayıcıda dolu
}

const EMPTY: HabitStats = {
  habit: null,
  currentStreak: 0,
  longestStreak: 0,
  totalAmount: null,
  series: null,
  goalPeriods: [],
  historyTotals: null,
};

// Grafikler artık yatayda kaydırılabilir (bkz. habit/[id].tsx) — ekrana sığan
// sayı azaldı ama kaydırarak ulaşılabilen aralık genişledi.
const HISTORY_BUCKETS = 30;

// "Geçmiş" kartının Gün/Hafta/Ay toplamları — yalnız target_amount'lı (nicel/
// zamanlayıcı) alışkanlıkta anlamlı. Her periyotta son HISTORY_BUCKETS kova;
// ekrana sığmayan kısım yatay kaydırmayla görülür (bkz. habit/[id].tsx
// HistoryBars).
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

  // — Gün: son HISTORY_BUCKETS gün —
  const day: BucketTotal[] = lastDays(HISTORY_BUCKETS).map((ymd) => ({
    bucketStart: ymd,
    total: amountByDate.get(ymd) ?? 0,
    partial: ymd === today || ymd < firstLogDate,
  }));

  // — Hafta: son HISTORY_BUCKETS hafta (Pazartesi başlangıçlı) —
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

  // — Ay: son HISTORY_BUCKETS takvim ayı —
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

    // WINDOW_DAYS'lik pencere yalnız toplam miktar için okunur; planlı/tamamlanan
    // gün sayımı ve tamamlanma oranı hesabı KALDIRILDI (bkz. HabitStats yorumu).
    const dates = lastDays(WINDOW_DAYS);
    const logs = habitRepo.logsInRange(habitId, dates[0]);

    const totalAmount =
      habit.target_amount != null ? logs.reduce((sum, l) => sum + (l.amount ?? 0), 0) : null;

    const allLogs = habitRepo.allLogs(habitId);
    const currentStreak = habitRepo.currentStreak(habitId);
    const longestStreak = habitRepo.longestStreak(habitId);
    setStats({
      habit,
      currentStreak,
      longestStreak,
      totalAmount,
      // Kilit KALDIRILDI (2026-07-23): puan artık 0'dan başlayıp adım adım
      // tırmandığı için ilk günlerin düşük değeri yanıltıcı değil, modelin ta
      // kendisi — gizlemek tam da görülmek istenen tırmanışı gizliyordu.
      series: buildSeries(habit, allLogs),
      goalPeriods: buildGoalPeriods(habit, allLogs, todayDate()),
      historyTotals: buildHistoryTotals(habit, allLogs, todayDate()),
    });
  }, [habitId]);

  useFocusEffect(reload);

  return stats;
}
