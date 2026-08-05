// "Bugün" ekranının veri yükleme mantığı: seçilen güne vadeli görevler + o gün
// planlı alışkanlıkların o güne özel durumu (miktar/tamamlanma/streak).
// Ekrandan ayrı tutulur ki index.tsx yalnızca render'dan sorumlu kalsın.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo, subtaskRepo, taskRepo } from '@/db';
import type { HabitKind, Task } from '@/db';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates } from '@/lib/helpers';
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
  // KOTA (haftada X kez) alışkanlığında o haftanın ilerlemesi ("2/3 bu hafta");
  // diğer kurallar için null.
  weekQuota: { done: number; target: number } | null;
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
    // Alt görev rozet sayıları tek sorguda (N+1 yerine); alt görevsiz görevler
    // sonuçta yer almaz — ayrı bir "total > 0" filtresine gerek yok.
    setSubtaskCounts(subtaskRepo.countsForTasks(taskList.map((t) => t.id)));
    // Yalnızca seçilen günde planlı (vadeli) ve yaşam aralığı (başlangıç/bitiş
    // tarihi) içindeki alışkanlıklar görünsün.
    const scheduled = habitRepo
      .listByUser(userId)
      .filter(
        (h) =>
          isScheduledOn(h.schedule, selectedDate) &&
          isWithinHabitDates(h.start_date, h.end_date, selectedDate)
      );
    // O günün miktar+tamamlanma durumları tek sorguda (alışkanlık başına iki ayrı
    // sorgu yerine). Log'u olmayan alışkanlık: miktar 0, tamamlanmadı.
    const dayStates = habitRepo.getDayStates(
      scheduled.map((h) => h.id),
      selectedDate
    );
    setHabits(
      scheduled.map((h) => {
        const state = dayStates[h.id];
        return {
          id: h.id,
          title: h.title,
          kind: h.kind,
          icon: h.icon,
          color: h.color,
          target: h.target_amount,
          unit: h.unit,
          amount: state?.amount ?? 0,
          completed: state?.completed ?? false,
          // Alışkanlık elimizde — currentStreak'in kendi getById'sini atlıyoruz.
          streak: habitRepo.currentStreak(h.id, h),
          weekQuota: isQuotaSchedule(h.schedule)
            ? {
                done: habitRepo.completionsInWeek(h.id, selectedDate),
                target: h.schedule!.timesPerWeek!,
              }
            : null,
        };
      })
    );
  }, [userId, selectedDate, today, dataVersion]);

  useFocusEffect(reload);

  return { tasks, habits, subtaskCounts, reload };
}
