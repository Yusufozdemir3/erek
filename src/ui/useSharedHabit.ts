// Data for a friend's shared habit: shown from cache immediately, then
// refreshed incrementally from the server. Stats and the calendar are computed
// by the SAME pure functions as the local stats screen.

import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { HabitLog } from '@/db';
import { todayDate } from '@/lib/helpers';
import {
  getCachedSharedHabitLogs,
  getCachedSharedHabits,
  getSharedHabits,
  syncSharedHabitLogs,
  toSharingError,
  type SharedHabit,
} from '@/sync';
import { computeHabitStats, EMPTY_HABIT_STATS, type HabitStats } from '@/ui/useHabitStats';
import { useCalendarFromLogs, type HabitCalendar } from '@/ui/useHabitCalendar';

export type SharedHabitStatus = 'loading' | 'ready' | 'offline' | 'gone';

export interface SharedHabitData {
  shared: SharedHabit | null;
  stats: HabitStats;
  calendar: HabitCalendar;
  status: SharedHabitStatus;
}

export function useSharedHabit(habitId: string): SharedHabitData {
  const [shared, setShared] = useState<SharedHabit | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [status, setStatus] = useState<SharedHabitStatus>('loading');

  const load = useCallback(() => {
    let active = true;
    (async () => {
      const cachedList = await getCachedSharedHabits();
      const cached = cachedList.find((s) => s.habit.id === habitId) ?? null;
      const cachedLogs = await getCachedSharedHabitLogs(habitId);
      if (!active) return;
      if (cached) setShared(cached);
      if (cachedLogs) setLogs(cachedLogs);

      try {
        const fresh = (await getSharedHabits()).find((s) => s.habit.id === habitId) ?? null;
        if (!active) return;
        if (!fresh) {
          setShared(null);
          setLogs([]);
          setStatus('gone');
          return;
        }
        setShared(fresh);
        const freshLogs = await syncSharedHabitLogs(habitId);
        if (!active) return;
        setLogs(freshLogs);
        setStatus('ready');
      } catch (e) {
        if (!active) return;
        setStatus(toSharingError(e).code === 'ERK_NOT_SHARED' ? 'gone' : 'offline');
      }
    })();
    return () => {
      active = false;
    };
  }, [habitId]);

  useFocusEffect(load);

  const habit = shared?.habit ?? null;
  const stats = useMemo(
    () => (habit ? computeHabitStats(habit, logs, todayDate()) : EMPTY_HABIT_STATS),
    [habit, logs]
  );
  const calendar = useCalendarFromLogs(habit, logs);

  return { shared, stats, calendar, status };
}
