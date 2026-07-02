// Alışkanlık istatistik ekranının veri yükleme mantığı: son 90 günün ısı
// haritası + güncel/en uzun seri + tamamlanma oranı + (nicelse) toplam miktar.
// Hepsi tek bir logsInRange sorgusundan türetilir.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { isScheduledOn, isWithinHabitDates, lastDays } from '@/lib/helpers';

const WINDOW_DAYS = 90;

export interface DayCell {
  date: string;
  scheduled: boolean;
  completed: boolean;
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
};

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

    setStats({
      habit,
      days,
      currentStreak: habitRepo.currentStreak(habitId),
      longestStreak: habitRepo.longestStreak(habitId),
      completionRate: scheduledCount > 0 ? completedCount / scheduledCount : 0,
      scheduledCount,
      completedCount,
      totalAmount,
    });
  }, [habitId]);

  useFocusEffect(reload);

  return stats;
}
