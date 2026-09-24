// Data loading logic for the habit stats screen: summary numbers (current/
// longest streak, completion rate, total amount), day/week/month completion
// series (bar chart), and streak history.
// All derived from the logsInRange/allLogs queries.

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

// The score chart's data generation and types moved to lib/habitSeries.ts (pure
// logic, no React dependency — so its tests run fast in the 'logic' project).
// Re-exported from here so screens can keep importing these types from this file.
export type { ChartBucket, HabitChartSeries } from '@/lib/habitSeries';

const WINDOW_DAYS = 90;

// "Goal" comparison: the FULL period target for the current day/week/month/year
// (future days included, "what would this be if you did this period entirely")
// versus the amount accumulated so far. The 'today' row is meaningless for a
// quota habit (no single-day target) — buildGoalPeriods filters it out.
export interface GoalPeriodStat {
  key: 'today' | 'week' | 'month' | 'quarter' | 'year';
  done: number;
  goal: number;
}

// A bucket's (day/week/month) total on the "History" card — only meaningful for
// numeric/timer (target_amount-having) habits (a binary habit has no concept of
// "total amount"). If partial=true, the bucket either starts with no data
// before today/this month (the habit's first bucket) or is still ongoing (not
// finished yet) — the UI shows it faded.
export interface BucketTotal {
  bucketStart: string;
  total: number;
  partial: boolean;
}

// The "History" card's Day/Week/Month options — the same three-way period
// pattern as CompletionChart, but carries the ACTUAL TOTAL amount instead of a ratio.
export interface HistoryTotals {
  day: BucketTotal[];
  week: BucketTotal[];
  month: BucketTotal[];
}

export interface HabitStats {
  habit: Habit | null;
  currentStreak: number;
  longestStreak: number;
  totalAmount: number | null;  // null if not numeric (no target_amount)
  // NOTE: completionRate/scheduledCount/completedCount and streaks were REMOVED —
  // lifetime completion rate was a blind copy of the EMA on the score card, and
  // the streak history list was also dropped from the screen (see
  // app/habit/[id].tsx). Both had that screen as their only consumer; keeping
  // the fields would have meant a wasted query/loop on every load.
  series: HabitChartSeries | null; // null if there are no logs at all
  goalPeriods: GoalPeriodStat[]; // Today/Week/Month/3 Months/Year goal comparison
  historyTotals: HistoryTotals | null; // "History" card — populated only for numeric/timer habits
}

const EMPTY: HabitStats = {
  habit: null,
  currentStreak: 0,
  longestStreak: 0,
  totalAmount: null,
  series: null,
  goalPeriods: [],
  historyTotals: null,
};

// Charts are now horizontally scrollable (see habit/[id].tsx) — fewer fit on
// screen at once, but the reachable range via scrolling has grown.
const HISTORY_BUCKETS = 30;

// The "History" card's Day/Week/Month totals — only meaningful for a habit with
// a target_amount (numeric/timer). The last HISTORY_BUCKETS buckets per period;
// anything that doesn't fit on screen is reached by scrolling horizontally (see
// habit/[id].tsx HistoryBars).
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
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // this week's Monday
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

// The period's FULL (future included) start/end day — the day/week/month/year
// today falls within. 'today' is never generated for a quota habit (see the caller).
function goalPeriodBounds(today: string): { key: GoalPeriodStat['key']; start: string; end: string }[] {
  const weekStart = weekStartOf(today);
  const weekEndD = new Date(`${weekStart}T00:00:00`);
  weekEndD.setDate(weekEndD.getDate() + 6);
  const t = new Date(`${today}T00:00:00`);
  const monthStart = toYmd(new Date(t.getFullYear(), t.getMonth(), 1));
  const monthEnd = toYmd(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  // "3 Months": the current calendar quarter (Jan-Mar/Apr-Jun/Jul-Sep/Oct-Dec) —
  // keeps the same "fixed calendar range" logic as the other periods of the year.
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

// For each period: goal = the target for ALL scheduled days in the period
// (future included, "if you did this period entirely"), done = the actual
// amount accumulated so far. Since a quota (X times a week) counts every day as
// "available," the scheduled-day filter isn't applied; the target is scaled
// from the weekly quota to the period's length instead.
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
          } else if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
            goal += perDayTarget;
            if (cursor <= doneEndD) done += amountOf(ymd);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
      return { key, done, goal };
    });
}

export function useHabitStats(habitId: string): HabitStats {
  const [stats, setStats] = useState<HabitStats>(EMPTY);

  const reload = useCallback(() => {
    const habit = habitRepo.getById(habitId);
    if (!habit) {
      setStats(EMPTY);
      return;
    }

    // The WINDOW_DAYS window is only read for the total amount; the
    // scheduled/completed day counts and completion-rate calculation were
    // REMOVED (see the HabitStats comment).
    const dates = lastDays(WINDOW_DAYS);
    const logs = habitRepo.logsInRange(habitId, dates[0]);

    const totalAmount =
      habit.target_amount != null ? logs.reduce((sum, l) => sum + (l.amount ?? 0), 0) : null;

    const allLogs = habitRepo.allLogs(habitId);
    const currentStreak = habitRepo.currentStreak(habitId);
    const longestStreak = habitRepo.longestStreak(habitId);
    setStats({
      habit,
      currentStreak,
      longestStreak,
      totalAmount,
      // Gate REMOVED (2026-07-23): since the score now starts at 0 and climbs
      // step by step, the low value on early days isn't misleading — it IS the
      // model; hiding it was hiding exactly the climb the user was meant to see.
      series: buildSeries(habit, allLogs),
      goalPeriods: buildGoalPeriods(habit, allLogs, todayDate()),
      historyTotals: buildHistoryTotals(habit, allLogs, todayDate()),
    });
  }, [habitId]);

  useFocusEffect(reload);

  return stats;
}
