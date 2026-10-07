// The habit stats screen's month calendar: Monday-first 7-column weeks
// (out-of-month cells are null), browsable back up to 24 months — never into
// the future.
//
// A habit without start_date has no known creation day, so old months can show
// days before it existed as missed; the 24-month limit keeps that small (a fix
// would need a created_at column).

import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit, HabitLog } from '@/db';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates, todayDate } from '@/lib/helpers';

const MAX_MONTHS_BACK = 24;

export interface CalendarDay {
  date: string;
  scheduled: boolean;
  completed: boolean;
  future: boolean; // not lived yet, so not missed
}

export interface HabitCalendar {
  habit: Habit | null;
  year: number;
  month: number; // 0-11
  weeks: (CalendarDay | null)[][]; // Mon..Sun; out-of-month = null
  canGoPrev: boolean;
  canGoNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// JS getDay() -> Monday-first column.
function mondayFirstIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// Pure: the Monday-first week grid of one month for a habit.
export function buildMonthWeeks(
  h: Habit,
  completedDates: Set<string>,
  year: number,
  month: number,
  today: string
): (CalendarDay | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // A quota habit has no due days, so an undone day isn't "missed": only done
  // days count as scheduled.
  const quota = isQuotaSchedule(h.schedule);
  const cells: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = ymd(year, month, day);
    const completed = completedDates.has(date);
    const scheduled = quota
      ? completed
      : isScheduledOn(h.schedule, date) && isWithinHabitDates(h.start_date, h.end_date, date, h.skip_dates);
    cells.push({ date, scheduled, completed, future: date > today });
  }

  // Pad to whole weeks.
  const leadPad = mondayFirstIndex(new Date(year, month, 1).getDay());
  const grid: (CalendarDay | null)[] = [...Array(leadPad).fill(null), ...cells];
  while (grid.length % 7 !== 0) grid.push(null);

  const built: (CalendarDay | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) built.push(grid.slice(i, i + 7));
  return built;
}

function useMonthCursor() {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = this month
  const today = todayDate();
  const now = new Date(`${today}T00:00:00`);
  const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  return {
    today,
    year: base.getFullYear(),
    month: base.getMonth(),
    canGoPrev: monthOffset > -MAX_MONTHS_BACK,
    canGoNext: monthOffset < 0,
    goPrev: () => setMonthOffset((o) => Math.max(-MAX_MONTHS_BACK, o - 1)),
    goNext: () => setMonthOffset((o) => Math.min(0, o + 1)),
  };
}

// refreshKey: bump it to reload right away (e.g. after a rest day was set).
export function useHabitCalendar(habitId: string, refreshKey = 0): HabitCalendar {
  const cursor = useMonthCursor();
  const { year, month, today } = cursor;
  const [habit, setHabit] = useState<Habit | null>(null);
  const [weeks, setWeeks] = useState<(CalendarDay | null)[][]>([]);

  const reload = useCallback(() => {
    const h = habitRepo.getById(habitId);
    setHabit(h);
    if (!h) {
      setWeeks([]);
      return;
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const logs = habitRepo.logsBetween(habitId, ymd(year, month, 1), ymd(year, month, daysInMonth));
    const completedDates = new Set(logs.filter((l) => l.completed === 1).map((l) => l.log_date));
    setWeeks(buildMonthWeeks(h, completedDates, year, month, today));
  }, [habitId, year, month, today, refreshKey]);

  useFocusEffect(reload);

  return { habit, weeks, ...cursor };
}

// Same calendar for data already in memory (a friend's shared habit).
export function useCalendarFromLogs(habit: Habit | null, logs: HabitLog[]): HabitCalendar {
  const cursor = useMonthCursor();
  const { year, month, today } = cursor;
  const weeks = useMemo(() => {
    if (!habit) return [];
    const completedDates = new Set(logs.filter((l) => l.completed === 1).map((l) => l.log_date));
    return buildMonthWeeks(habit, completedDates, year, month, today);
  }, [habit, logs, year, month, today]);
  return { habit, weeks, ...cursor };
}
