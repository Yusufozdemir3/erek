// Habit stats screen data: streaks, totals, the score chart series, period
// goals and the History card, all derived from the habit's logs.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit, HabitLog } from '@/db';
import {
  diffDays,
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  todayDate,
  toYmd,
  weekStartOf,
} from '@/lib/helpers';
import { buildSeries, type HabitChartSeries } from '@/lib/habitSeries';
import { currentStreakFrom, longestStreakFrom } from '@/lib/streaks';

export type { ChartBucket, HabitChartSeries } from '@/lib/habitSeries';

const WINDOW_DAYS = 90;

// The current day/week/month/quarter/year: its WHOLE target (future days
// included) vs. what's done so far. Quota habits have no 'today' row.
export interface GoalPeriodStat {
  key: 'today' | 'week' | 'month' | 'quarter' | 'year';
  done: number;
  goal: number;
}

// One bar of the History card (numeric/timer habits). partial = the habit's
// first bucket or one still running; drawn faded.
export interface BucketTotal {
  bucketStart: string;
  total: number;
  partial: boolean;
}

export interface HistoryTotals {
  day: BucketTotal[];
  week: BucketTotal[];
  month: BucketTotal[];
}

export interface HabitStats {
  habit: Habit | null;
  currentStreak: number;
  longestStreak: number;
  totalAmount: number | null;  // null without a target
  series: HabitChartSeries | null; // null without any logs
  goalPeriods: GoalPeriodStat[];
  historyTotals: HistoryTotals | null; // numeric/timer only
}

export const EMPTY_HABIT_STATS: HabitStats = {
  habit: null,
  currentStreak: 0,
  longestStreak: 0,
  totalAmount: null,
  series: null,
  goalPeriods: [],
  historyTotals: null,
};

// Buckets per History tab; older ones are reached by scrolling.
const HISTORY_BUCKETS = 30;

function buildHistoryTotals(habit: Habit, allLogs: HabitLog[], today: string): HistoryTotals | null {
  if (habit.target_amount == null || allLogs.length === 0) return null;
  const amountByDate = new Map(allLogs.map((l) => [l.log_date, l.amount ?? 0]));
  const firstLogDate = allLogs[0].log_date;

  const sumRange = (startYmd: string, endYmd: string): number => {
    let total = 0;
    const cursor = new Date(`${startYmd}T00:00:00`);
    const end = new Date(`${endYmd}T00:00:00`);
    while (cursor <= end) {
      total += amountByDate.get(toYmd(cursor)) ?? 0;
      cursor.setDate(cursor.getDate() + 1);
    }
    return total;
  };

  // — Day: last HISTORY_BUCKETS days —
  const day: BucketTotal[] = lastDays(HISTORY_BUCKETS).map((ymd) => ({
    bucketStart: ymd,
    total: amountByDate.get(ymd) ?? 0,
    partial: ymd === today || ymd < firstLogDate,
  }));

  // — Week: last HISTORY_BUCKETS weeks (Monday-first) —
  const monday = new Date(`${today}T00:00:00`);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week: BucketTotal[] = [];
  for (let i = HISTORY_BUCKETS - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    week.push({
      bucketStart: startYmd,
      total: sumRange(startYmd, endYmd),
      partial: endYmd > today || startYmd < firstLogDate,
    });
  }

  // — Month: last HISTORY_BUCKETS calendar months —
  const now = new Date(`${today}T00:00:00`);
  const month: BucketTotal[] = [];
  for (let i = HISTORY_BUCKETS - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    month.push({
      bucketStart: startYmd,
      total: sumRange(startYmd, endYmd),
      partial: endYmd > today || startYmd < firstLogDate,
    });
  }

  return { day, week, month };
}

// The full calendar periods containing today.
function goalPeriodBounds(today: string): { key: GoalPeriodStat['key']; start: string; end: string }[] {
  const weekStart = weekStartOf(today);
  const weekEndD = new Date(`${weekStart}T00:00:00`);
  weekEndD.setDate(weekEndD.getDate() + 6);
  const t = new Date(`${today}T00:00:00`);
  const monthStart = toYmd(new Date(t.getFullYear(), t.getMonth(), 1));
  const monthEnd = toYmd(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  // "3 months" = the calendar quarter.
  const qStartMonth = Math.floor(t.getMonth() / 3) * 3;
  const quarterStart = toYmd(new Date(t.getFullYear(), qStartMonth, 1));
  const quarterEnd = toYmd(new Date(t.getFullYear(), qStartMonth + 3, 0));
  return [
    { key: 'today', start: today, end: today },
    { key: 'week', start: weekStart, end: toYmd(weekEndD) },
    { key: 'month', start: monthStart, end: monthEnd },
    { key: 'quarter', start: quarterStart, end: quarterEnd },
    { key: 'year', start: `${t.getFullYear()}-01-01`, end: `${t.getFullYear()}-12-31` },
  ];
}

// goal = the target over every scheduled day of the period; done = so far.
// A quota habit scales its weekly quota to the period instead.
function buildGoalPeriods(habit: Habit, allLogs: HabitLog[], today: string): GoalPeriodStat[] {
  const logByDate = new Map(allLogs.map((l) => [l.log_date, l]));
  const perDayTarget = habit.target_amount ?? 1;
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;
  const amountOf = (ymd: string): number => {
    const log = logByDate.get(ymd);
    if (!log) return 0;
    return habit.target_amount != null ? log.amount ?? 0 : log.completed === 1 ? 1 : 0;
  };

  return goalPeriodBounds(today)
    .filter((b) => !(quota && b.key === 'today'))
    .map(({ key, start, end }) => {
      let done = 0;
      let goal = 0;
      const doneEnd = end < today ? end : today;
      if (quota) {
        goal = ((quota * (diffDays(start, end) + 1)) / 7) * perDayTarget;
      }
      if (start <= doneEnd) {
        const cursor = new Date(`${start}T00:00:00`);
        const endD = new Date(`${end}T00:00:00`);
        const doneEndD = new Date(`${doneEnd}T00:00:00`);
        while (cursor <= endD) {
          const ymd = toYmd(cursor);
          if (quota) {
            if (cursor <= doneEndD) done += amountOf(ymd);
          } else if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd, habit.skip_dates)) {
            goal += perDayTarget;
            if (cursor <= doneEndD) done += amountOf(ymd);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      return { key, done, goal };
    });
}

// Pure, so a friend's shared habit (useSharedHabit) gets the same numbers.
export function computeHabitStats(habit: Habit, allLogs: HabitLog[], today: string): HabitStats {
  // The window only feeds the total amount.
  const windowStart = new Date(`${today}T00:00:00`);
  windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));
  const windowStartYmd = toYmd(windowStart);
  const totalAmount =
    habit.target_amount != null
      ? allLogs
          .filter((l) => l.log_date >= windowStartYmd)
          .reduce((sum, l) => sum + (l.amount ?? 0), 0)
      : null;
  const completedDates = allLogs.filter((l) => l.completed === 1).map((l) => l.log_date);

  return {
    habit,
    currentStreak: currentStreakFrom(habit, completedDates, today),
    longestStreak: longestStreakFrom(habit, completedDates, today),
    totalAmount,
    series: buildSeries(habit, allLogs),
    goalPeriods: buildGoalPeriods(habit, allLogs, today),
    historyTotals: buildHistoryTotals(habit, allLogs, today),
  };
}

// refreshKey: bump it to reload right away (e.g. after a rest day was set).
export function useHabitStats(habitId: string, refreshKey = 0): HabitStats {
  const [stats, setStats] = useState<HabitStats>(EMPTY_HABIT_STATS);

  const reload = useCallback(() => {
    const habit = habitRepo.getById(habitId);
    setStats(habit ? computeHabitStats(habit, habitRepo.allLogs(habitId), todayDate()) : EMPTY_HABIT_STATS);
  }, [habitId, refreshKey]);

  useFocusEffect(reload);

  return stats;
}
