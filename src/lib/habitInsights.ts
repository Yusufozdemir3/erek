// Alışkanlık istatistik ekranındaki "İçgörüler" — tamamen cihazda hesaplanan,
// basit KURAL TABANLI gözlemler (log geçmişinden türetilir). Gerçek bir AI/LLM
// ÇAĞRISI YOK: veri hiçbir zaman cihazdan çıkmaz, maliyet/gizlilik sorunu yok.
// Bilinçli küçük başlangıç — ileride bulut tabanlı analiz eklenirse bu katman
// (basit, ücretsiz gözlemler) yerinde kalır, AI katmanı bunun ÜSTÜNE eklenir.

import type { Habit, HabitLog } from '@/db';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates, toYmd } from '@/lib/helpers';

export type HabitInsight =
  | { kind: 'trendUp'; recentRate: number; priorRate: number }
  | { kind: 'trendDown'; recentRate: number; priorRate: number }
  | { kind: 'bestWeekday'; weekday: number; rate: number }
  | { kind: 'worstWeekday'; weekday: number; rate: number }
  | { kind: 'streakRecord'; days: number }
  | { kind: 'streakActive'; days: number };

const TREND_WINDOW_DAYS = 7;
const TREND_MIN_SCHEDULED = 4; // pencere başına en az bu kadar planlı gün olmalı — yoksa gürültü
const TREND_MIN_GAP = 0.15; // en az 15 puan fark olmalı
const WEEKDAY_WINDOW_DAYS = 90; // istatistik ekranındaki genel pencereyle aynı
const WEEKDAY_MIN_OCCURRENCES = 3; // her gün için en az bu kadar planlı örnek — istatistiksel gürültüyü eler
const WEEKDAY_MIN_GAP = 0.25;

function ymdAdd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

// Bir tarih aralığındaki planlı/tamamlanan gün sayısı. Kota (haftada X kez)
// alışkanlıkta her gün "müsait" sayılır (isScheduledOn zaten true döner) —
// bu fonksiyon o durumda da çalışır, sadece "planlı" kelimesinin anlamı değişir.
function scheduledCompletedInRange(
  habit: Habit,
  completedSet: Set<string>,
  startYmd: string,
  endYmd: string
): { scheduled: number; completed: number } {
  let scheduled = 0;
  let completed = 0;
  const cursor = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
      scheduled++;
      if (completedSet.has(ymd)) completed++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { scheduled, completed };
}

// Son 7 gün ile önceki 7 günü karşılaştırır. Her iki pencerede de yeterli
// planlı gün yoksa (yeni alışkanlık, seyrek sıklık) ya da fark önemsizse null.
function buildTrendInsight(habit: Habit, completedSet: Set<string>, today: string): HabitInsight | null {
  const recentStart = ymdAdd(today, -(TREND_WINDOW_DAYS - 1));
  const priorEnd = ymdAdd(recentStart, -1);
  const priorStart = ymdAdd(priorEnd, -(TREND_WINDOW_DAYS - 1));

  const recent = scheduledCompletedInRange(habit, completedSet, recentStart, today);
  const prior = scheduledCompletedInRange(habit, completedSet, priorStart, priorEnd);
  if (recent.scheduled < TREND_MIN_SCHEDULED || prior.scheduled < TREND_MIN_SCHEDULED) return null;

  const recentRate = recent.completed / recent.scheduled;
  const priorRate = prior.completed / prior.scheduled;
  const gap = recentRate - priorRate;
  if (Math.abs(gap) < TREND_MIN_GAP) return null;

  return gap > 0 ? { kind: 'trendUp', recentRate, priorRate } : { kind: 'trendDown', recentRate, priorRate };
}

// Haftanın günlerine göre tamamlanma paterni — kota alışkanlıkta anlamsız
// (her gün zaten "müsait"; hangi güne denk geldiği hedefi etkilemez), çağıran
// onu atlar. En düşük gün, en yüksek günden daha "eyleme geçirilebilir" bilgi
// (zayıf noktayı işaret eder) — ikisi de eşiği geçerse ona öncelik verilir.
function buildWeekdayInsight(habit: Habit, completedSet: Set<string>, today: string): HabitInsight | null {
  const scheduled = new Array(7).fill(0);
  const completed = new Array(7).fill(0);
  const cursor = new Date(`${ymdAdd(today, -(WEEKDAY_WINDOW_DAYS - 1))}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
      const wd = cursor.getDay();
      scheduled[wd]++;
      if (completedSet.has(ymd)) completed[wd]++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  let best = -1;
  let worst = -1;
  let bestRate = -1;
  let worstRate = 2;
  for (let wd = 0; wd < 7; wd++) {
    if (scheduled[wd] < WEEKDAY_MIN_OCCURRENCES) continue;
    const rate = completed[wd] / scheduled[wd];
    if (rate > bestRate) {
      bestRate = rate;
      best = wd;
    }
    if (rate < worstRate) {
      worstRate = rate;
      worst = wd;
    }
  }
  if (best < 0 || worst < 0 || best === worst) return null;
  if (bestRate - worstRate < WEEKDAY_MIN_GAP) return null;

  return worstRate < 0.5 ? { kind: 'worstWeekday', weekday: worst, rate: worstRate } : { kind: 'bestWeekday', weekday: best, rate: bestRate };
}

function buildStreakInsight(currentStreak: number, longestStreak: number): HabitInsight | null {
  if (currentStreak < 3) return null;
  return currentStreak >= longestStreak ? { kind: 'streakRecord', days: currentStreak } : { kind: 'streakActive', days: currentStreak };
}

// En fazla 2 içgörü döner (kart kalabalıklaşmasın). Öncelik: seri > trend >
// haftanın günü — seri en "duygusal"/motive edici, haftanın günü en az acil.
export function buildHabitInsights(
  habit: Habit,
  allLogs: HabitLog[],
  today: string,
  currentStreak: number,
  longestStreak: number
): HabitInsight[] {
  const completedSet = new Set(allLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
  const quota = isQuotaSchedule(habit.schedule);

  const out: HabitInsight[] = [];
  const streak = buildStreakInsight(currentStreak, longestStreak);
  if (streak) out.push(streak);

  const trend = buildTrendInsight(habit, completedSet, today);
  if (trend) out.push(trend);

  if (!quota && out.length < 2) {
    const weekday = buildWeekdayInsight(habit, completedSet, today);
    if (weekday) out.push(weekday);
  }

  return out.slice(0, 2);
}
