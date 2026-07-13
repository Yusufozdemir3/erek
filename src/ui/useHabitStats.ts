// Alışkanlık istatistik ekranının veri yükleme mantığı: son 90 günün ısı
// haritası + güncel/en uzun seri + tamamlanma oranı + (nicelse) toplam miktar.
// Hepsi tek bir logsInRange sorgusundan türetilir.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { isScheduledOn, isWithinHabitDates, lastDays, todayDate, WEEKDAY_DISPLAY_ORDER } from '@/lib/helpers';

const WINDOW_DAYS = 90;

export interface DayCell {
  date: string;
  scheduled: boolean;
  completed: boolean;
}

// Seri geçmişi (habitRepo.allStreaks'in aynısı — burada yalnız tip takma adı).
export interface StreakEntry {
  length: number;
  start: string;
  end: string;
}

// Güç puanı grafiği bir günü (habitRepo.scoreHistory'nin aynısı).
export interface ScorePoint {
  date: string;
  score: number; // 0..1
}

// Haftanın bir günü için tamamlanma oranı. wd = JS getDay() (0=Pazar...6=Cumartesi).
export interface WeekdayStat {
  wd: number;
  scheduled: number;
  completed: number;
  rate: number; // 0..1; scheduled=0 ise 0
}

export interface HabitStats {
  habit: Habit | null;
  days: DayCell[];             // son 90 gün, en eskiden bugüne
  currentStreak: number;
  longestStreak: number;
  completionRate: number;      // 0..1, yalnızca planlı günler üzerinden
  scheduledCount: number;
  completedCount: number;
  totalAmount: number | null;  // nicel değilse (target_amount yoksa) null
  weekday: WeekdayStat[];       // Pazartesi'den Pazar'a sıralı, 7 eleman (veri yoksa [])
  streaks: StreakEntry[];       // büyükten küçüğe, TÜM geçmiş seriler
  score: ScorePoint[];          // son 90 gün, en eskiden bugüne (veri yoksa [])
}

const EMPTY: HabitStats = {
  habit: null,
  days: [],
  currentStreak: 0,
  longestStreak: 0,
  completionRate: 0,
  scheduledCount: 0,
  completedCount: 0,
  totalAmount: null,
  weekday: [],
  streaks: [],
  score: [],
};

// Haftanın günü kırılımı: alışkanlığın ilk logundan (ya da varsa ondan önceki
// start_date'ten) bugüne kadar gün gün yürüyüp yalnızca PLANLI günleri JS
// getDay()'e göre kovalar — hangi günlerin güçlü/zayıf olduğunu gösterir.
// Log yoksa [] (henüz veri yok, UI boş durum gösterir).
function weekdayBreakdown(habit: Habit, allLogs: { log_date: string; completed: 0 | 1 }[]): WeekdayStat[] {
  if (allLogs.length === 0) return [];

  const completed = new Set(allLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
  const firstLogDate = allLogs[0].log_date;
  const firstDate = habit.start_date && habit.start_date < firstLogDate ? habit.start_date : firstLogDate;
  const today = todayDate();

  const buckets = Array.from({ length: 7 }, () => ({ scheduled: 0, completed: 0 }));
  const cursor = new Date(`${firstDate}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (isScheduledOn(habit.schedule, dateStr) && isWithinHabitDates(habit.start_date, habit.end_date, dateStr)) {
      const wd = cursor.getDay();
      buckets[wd].scheduled++;
      if (completed.has(dateStr)) buckets[wd].completed++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return WEEKDAY_DISPLAY_ORDER.map((wd) => ({
    wd,
    scheduled: buckets[wd].scheduled,
    completed: buckets[wd].completed,
    rate: buckets[wd].scheduled > 0 ? buckets[wd].completed / buckets[wd].scheduled : 0,
  }));
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

    let scheduledCount = 0;
    let completedCount = 0;
    const days: DayCell[] = dates.map((date) => {
      // Aralık dışı (başlangıçtan önce / bitişten sonra) günler planlı sayılmaz:
      // ısı haritasında gri görünür, "kaçırıldı" (kırmızı) olmaz, orana girmez.
      const scheduled =
        isScheduledOn(habit.schedule, date) &&
        isWithinHabitDates(habit.start_date, habit.end_date, date);
      const completed = completedDates.has(date);
      if (scheduled) {
        scheduledCount++;
        if (completed) completedCount++;
      }
      return { date, scheduled, completed };
    });

    const totalAmount =
      habit.target_amount != null ? logs.reduce((sum, l) => sum + (l.amount ?? 0), 0) : null;

    const allLogs = habitRepo.allLogs(habitId);

    setStats({
      habit,
      days,
      currentStreak: habitRepo.currentStreak(habitId),
      longestStreak: habitRepo.longestStreak(habitId),
      completionRate: scheduledCount > 0 ? completedCount / scheduledCount : 0,
      scheduledCount,
      completedCount,
      totalAmount,
      weekday: weekdayBreakdown(habit, allLogs),
      streaks: habitRepo.allStreaks(habitId),
      score: habitRepo.scoreHistory(habitId, WINDOW_DAYS),
    });
  }, [habitId]);

  useFocusEffect(reload);

  return stats;
}
