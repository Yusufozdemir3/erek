// Today screen data: the selected day's tasks and the habits scheduled that
// day with their amount, completion and streak.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo, subtaskRepo, taskRepo } from '@/db';
import type { HabitKind, Task } from '@/db';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { computeWeekProgress, type WeekProgress } from '@/ui/weekProgress';

export interface HabitView {
  id: string;
  title: string;
  kind: HabitKind;
  icon: string | null;
  color: string | null;
  target: number | null; // numeric: amount · timer: target seconds · binary: null
  unit: string | null;
  amount: number;        // on the selected day
  completed: boolean;
  streak: number;
  // Quota habits: the week's progress ("2/3").
  weekQuota: { done: number; target: number } | null;
}

// A rest day: counted nowhere, listed last so it can be taken back.
export interface SkippedHabitView {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
}

export function useTodayData(userId: string, selectedDate: string, today: string) {
  // Reloads on dataVersion too (off-screen changes fire no focus event).
  const { dataVersion } = useAppData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);
  const [skippedHabits, setSkippedHabits] = useState<SkippedHabitView[]>([]);
  // Per-day completion for the week strip's dots.
  const [weekProgress, setWeekProgress] = useState<WeekProgress>({});
  // "1/3" badges; tasks without subtasks are absent.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});

  const reload = useCallback(() => {
    // Today also carries over earlier open tasks; other days show only their own.
    const isToday = selectedDate === today;
    const taskList = isToday
      ? taskRepo.listForToday(userId, selectedDate)
      : taskRepo.listByDueDate(userId, selectedDate);
    setTasks(taskList);
    setSubtaskCounts(subtaskRepo.countsForTasks(taskList.map((t) => t.id)));
    const dueToday = habitRepo
      .listByUser(userId)
      .filter(
        (h) =>
          isScheduledOn(h.schedule, selectedDate) &&
          isWithinHabitDates(h.start_date, h.end_date, selectedDate)
      );
    const scheduled = dueToday.filter((h) => !h.skip_dates?.includes(selectedDate));
    setSkippedHabits(
      dueToday
        .filter((h) => h.skip_dates?.includes(selectedDate))
        .map((h) => ({ id: h.id, title: h.title, icon: h.icon, color: h.color }))
    );
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
    setWeekProgress(computeWeekProgress(userId, selectedDate, today));
  }, [userId, selectedDate, today, dataVersion]);

  useFocusEffect(reload);

  return { tasks, habits, skippedHabits, subtaskCounts, weekProgress, reload };
}
