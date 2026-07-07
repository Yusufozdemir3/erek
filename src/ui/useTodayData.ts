// "Bugün" ekranının veri yükleme mantığı: seçilen güne vadeli görevler + o gün
// planlı alışkanlıkların o güne özel durumu (miktar/tamamlanma/streak).
// Ekrandan ayrı tutulur ki index.tsx yalnızca render'dan sorumlu kalsın.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo, subtaskRepo, taskRepo } from '@/db';
import type { HabitKind, Task } from '@/db';
import { isScheduledOn, isWithinHabitDates } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';

export interface HabitView {
  id: string;
  title: string;
  kind: HabitKind;
  icon: string | null;
  color: string | null;
  target: number | null; // numeric: miktar · timer: hedef saniye · binary: null
  unit: string | null;
  amount: number;        // seçilen günde yapılan miktar
  completed: boolean;    // seçilen günde tamamlandı mı
  streak: number;
}

export function useTodayData(userId: string, selectedDate: string, today: string) {
  // dataVersion: merkezi ＋ menüsünden ekleme yapılınca artar. reload'un
  // bağımlılığına girer; useFocusEffect, callback değişince ekran odaktayken de
  // effect'i yeniden çalıştırdığı için liste odak değişmeden tazelenir.
  const { dataVersion } = useAppData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);
  // Görev kartındaki "1/3 alt görev" rozeti; yalnızca alt görevi olanlar girer.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});

  const reload = useCallback(() => {
    // Bugün için kümülatif "devreden görev" davranışı korunur; başka günlerde
    // sadece o güne vadeli görevler gösterilir.
    const isToday = selectedDate === today;
    const taskList = isToday
      ? taskRepo.listForToday(userId, selectedDate)
      : taskRepo.listByDueDate(userId, selectedDate);
    setTasks(taskList);
    const counts: Record<string, { done: number; total: number }> = {};
    for (const t of taskList) {
      const c = subtaskRepo.countForTask(t.id);
      if (c.total > 0) counts[t.id] = c;
    }
    setSubtaskCounts(counts);
    setHabits(
      habitRepo
        .listByUser(userId)
        // Yalnızca seçilen günde planlı (vadeli) ve yaşam aralığı (başlangıç/
        // bitiş tarihi) içindeki alışkanlıklar görünsün.
        .filter(
          (h) =>
            isScheduledOn(h.schedule, selectedDate) &&
            isWithinHabitDates(h.start_date, h.end_date, selectedDate)
        )
        .map((h) => ({
          id: h.id,
          title: h.title,
          kind: h.kind,
          icon: h.icon,
          color: h.color,
          target: h.target_amount,
          unit: h.unit,
          amount: habitRepo.getAmountOn(h.id, selectedDate),
          completed: habitRepo.isCompletedOn(h.id, selectedDate),
          streak: habitRepo.currentStreak(h.id),
        }))
    );
  }, [userId, selectedDate, today, dataVersion]);

  useFocusEffect(reload);

  return { tasks, habits, subtaskCounts, reload };
}
