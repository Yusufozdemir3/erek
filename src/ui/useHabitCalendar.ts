// Data/navigation logic for the "full calendar" section on the habit stats
// screen. Can navigate month by month, forward/backward (backward only; can't
// go to a future month). Produces a 7-column, Monday-first week grid for each
// month; out-of-month cells are null (padding).

// KNOWN LIMITATION: the Habit table has no real "creation date" field
// (an empty start_date means "since the beginning," but when that beginning
// was is unknown). So for a habit with no start_date, navigating far enough
// back can show days before the habit even existed as "scheduled but missed"
// (red) — the existing 90-day heatmap has the same limitation, this just makes
// it more visible. Fully preventing it would require a new created_at field
// (a schema migration); for now, navigation is limited to the last 24 months
// to reduce the impact.

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
  future: boolean; // after today — not "missed," just not yet lived
}

export interface HabitCalendar {
  habit: Habit | null;
  year: number;
  month: number; // 0-11 (JS Date month)
  weeks: (CalendarDay | null)[][]; // 7 cells per week (Mon..Sun); out-of-month = null
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

// JS getDay() (0=Sunday..6=Saturday) -> Monday-first column (0..6).
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
  // Under a QUOTA (X times a week) rule, no single day is individually due:
  // an incomplete day must NOT be colored "missed" (red). So for quota habits,
  // scheduled is only true on COMPLETED days — done days show up colored on
  // the calendar, the rest appear neutral.
  const quota = isQuotaSchedule(h.schedule);
  const cells: CalendarDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = ymd(year, month, day);
    const completed = completedDates.has(date);
    const scheduled = quota
      ? completed
      : isScheduledOn(h.schedule, date) && isWithinHabitDates(h.start_date, h.end_date, date);
    cells.push({ date, scheduled, completed, future: date > today });
  }

  // Add leading padding (null) based on where the 1st of the month falls in
  // the week; also pad the end until the length is a multiple of 7.
  const leadPad = mondayFirstIndex(new Date(year, month, 1).getDay());
  const grid: (CalendarDay | null)[] = [...Array(leadPad).fill(null), ...cells];
  while (grid.length % 7 !== 0) grid.push(null);

  const built: (CalendarDay | null)[][] = [];
  for (let i = 0; i < grid.length; i += 7) built.push(grid.slice(i, i + 7));
  return built;
}

function useMonthCursor() {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = the current month
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

export function useHabitCalendar(habitId: string): HabitCalendar {
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
  }, [habitId, year, month, today]);

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
