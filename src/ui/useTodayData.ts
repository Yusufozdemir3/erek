// "Bugün" ekranının veri yükleme mantığı: seçilen güne vadeli görevler + o gün
// planlı alışkanlıkların o güne özel durumu (miktar/tamamlanma/streak).
// Ekrandan ayrı tutulur ki index.tsx yalnızca render'dan sorumlu kalsın.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { isScheduledOn } from '@/lib/helpers';

export interface HabitView {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  target: number | null; // nicel hedef; null = ikili
  unit: string | null;
  amount: number;        // seçilen günde yapılan miktar
  completed: boolean;    // seçilen günde tamamlandı mı
  streak: number;
}

export function useTodayData(userId: string, selectedDate: string, today: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);

  const reload = useCallback(() => {
    // Bugün için kümülatif "devreden görev" davranışı korunur; başka günlerde
    // sadece o güne vadeli görevler gösterilir.
    const isToday = selectedDate === today;
    setTasks(
      isToday
        ? taskRepo.listForToday(userId, selectedDate)
        : taskRepo.listByDueDate(userId, selectedDate)
    );
    setHabits(
      habitRepo
        .listByUser(userId)
        // Yalnızca seçilen günde planlı (vadeli) alışkanlıklar görünsün.
        .filter((h) => isScheduledOn(h.schedule, selectedDate))
        .map((h) => ({
          id: h.id,
          title: h.title,
          icon: h.icon,
          color: h.color,
          target: h.target_amount,
          unit: h.unit,
          amount: habitRepo.getAmountOn(h.id, selectedDate),
          completed: habitRepo.isCompletedOn(h.id, selectedDate),
          streak: habitRepo.currentStreak(h.id),
        }))
    );
  }, [userId, selectedDate, today]);

  useFocusEffect(reload);

  return { tasks, habits, reload };
}
