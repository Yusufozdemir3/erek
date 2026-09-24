// Data loading logic for the "Today" screen: tasks due on the selected day +
// the day-specific status (amount/completion/streak) of habits scheduled that
// day. Kept separate from the screen so index.tsx stays responsible only for rendering.

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
  target: number | null; // numeric: amount · timer: target seconds · binary: null
  unit: string | null;
  amount: number;        // amount done on the selected day
  completed: boolean;    // whether it was completed on the selected day
  streak: number;
  // For a QUOTA (X times a week) habit, that week's progress ("2/3 this week");
  // null for other rules.
  weekQuota: { done: number; target: number } | null;
}

export function useTodayData(userId: string, selectedDate: string, today: string) {
  // dataVersion: increments when something is added via the central ＋ menu. It
  // goes into reload's dependencies; since useFocusEffect re-runs the effect
  // when the callback changes even while the screen is focused, the list
  // refreshes without needing a focus change.
  const { dataVersion } = useAppData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);
  // The "1/3 subtasks" badge on the task card; only tasks with subtasks are included.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});

  const reload = useCallback(() => {
    // The cumulative "carried-over task" behavior is preserved for today; on
    // other days, only tasks due that specific day are shown.
    const isToday = selectedDate === today;
    const taskList = isToday
      ? taskRepo.listForToday(userId, selectedDate)
      : taskRepo.listByDueDate(userId, selectedDate);
    setTasks(taskList);
    // Subtask badge counts in a single query (instead of N+1); tasks with no
    // subtasks just don't end up in the result — no separate "total > 0" filter needed.
    setSubtaskCounts(subtaskRepo.countsForTasks(taskList.map((t) => t.id)));
    // Only show habits that are scheduled on the selected day and within their
    // lifespan (start/end date).
    const scheduled = habitRepo
      .listByUser(userId)
      .filter(
        (h) =>
          isScheduledOn(h.schedule, selectedDate) &&
          isWithinHabitDates(h.start_date, h.end_date, selectedDate)
      );
    // That day's amount+completion status in a single query (instead of two
    // separate queries per habit). A habit with no log: amount 0, not completed.
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
          // We already have the habit — skip currentStreak's own getById.
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
