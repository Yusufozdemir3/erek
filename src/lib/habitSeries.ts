// Data for the habit score chart (pure; runs in the 'logic' test project).
// The chart shows continuity only: for every habit type the question is
// "was the day completed?" (no partial credit). The score starts at 0 and
// moves step by step (habitScore.ts); an unscheduled day is NEUTRAL — kept in
// the series so the line doesn't break, but it moves nothing.

import type { Habit, HabitLog } from '@/db';
import {
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  lastDays,
  todayDate,
  toYmd,
  weekStartOf,
} from '@/lib/helpers';
import {
  SCORE_EMA_ALPHA,
  SCORE_EMA_ALPHA_MONTH,
  SCORE_EMA_ALPHA_WEEK,
  emaScores,
} from '@/lib/habitScore';

const DAY_BUCKETS = 30;
const WEEK_BUCKETS = 12;
const MONTH_BUCKETS = 12;
// Hidden buckets before the visible range, so the first visible score carries
// the history before it.
const DAY_WARMUP = 60;
const WEEK_WARMUP = 12;
const MONTH_WARMUP = 12;

// date = the bucket's first day; score = what's drawn; partial = still running
// (today, this week/month), drawn faded.
export interface ChartBucket {
  date: string;
  // 0..1; null = neutral (nothing scheduled in the bucket).
  ratio: number | null;
  score: number;
  partial: boolean;
}

// The chart's Day / Week / Month tabs.
export interface HabitChartSeries {
  day: ChartBucket[];
  week: ChartBucket[];
  month: ChartBucket[];
}

// Completed or not, for every kind (numeric/timer: target reached). Partial
// credit would make the Day tab disagree with Week/Month, which count completions.
function dayRatio(log: HabitLog | undefined): number {
  return log?.completed === 1 ? 1 : 0;
}

// Completed / scheduled days in [start, end], future days excluded; null when
// nothing is scheduled (neutral). For a quota habit each day expects quota/7
// (an approximation that ignores week boundaries).
function rangeRatio(
  habit: Habit,
  completedSet: Set<string>,
  startYmd: string,
  endYmd: string,
  today: string
): number | null {
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;
  let scheduled = 0;
  let done = 0;
  let quotaDays = 0;
  const cursor = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  while (cursor <= end) {
    const ymd = toYmd(cursor);
    if (ymd > today) break;
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd, habit.skip_dates)) {
      if (quota) quotaDays++;
      else scheduled++;
      if (completedSet.has(ymd)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (quota) {
    const expected = (quota * quotaDays) / 7;
    return expected > 0 ? Math.min(1, done / expected) : null;
  }
  return scheduled > 0 ? done / scheduled : null;
}

// Drops leading buckets that end before the habit existed (first log / start_date).
function trimLeading(buckets: ChartBucket[], bucketEndOf: (b: ChartBucket) => string, firstDate: string): ChartBucket[] {
  let i = 0;
  while (i < buckets.length - 1 && bucketEndOf(buckets[i]) < firstDate) i++;
  return buckets.slice(i);
}

export function buildSeries(habit: Habit, allLogs: HabitLog[]): HabitChartSeries | null {
  if (allLogs.length === 0) return null;
  const today = todayDate();
  const logByDate = new Map(allLogs.map((l) => [l.log_date, l]));
  const completedSet = new Set(allLogs.filter((l) => l.completed === 1).map((l) => l.log_date));
  const firstLogDate = allLogs[0].log_date;
  const firstDate = habit.start_date && habit.start_date < firstLogDate ? habit.start_date : firstLogDate;
  const quota = isQuotaSchedule(habit.schedule) ? habit.schedule!.timesPerWeek! : null;

  // — Day: one day per bucket. A quota habit uses the week's ratio so far (a
  // single day's 0/1 would look low even while the quota is met). An
  // unscheduled day is neutral, not 0, so Mon/Wed/Fri done perfectly reads 100%.
  const dayDates = lastDays(DAY_BUCKETS + DAY_WARMUP);
  const dayRaw: ChartBucket[] = dayDates.map((date) => {
    const ratio = quota
      ? rangeRatio(habit, completedSet, weekStartOf(date), date, today)
      : isScheduledOn(habit.schedule, date) && isWithinHabitDates(habit.start_date, habit.end_date, date, habit.skip_dates)
        ? dayRatio(logByDate.get(date))
        : null;
    return { date, ratio, score: 0, partial: date === today };
  });

  // — Week: bucket = a week (starting Monday) —
  const weekRaw: ChartBucket[] = [];
  const monday = new Date(`${today}T00:00:00`);
  const jsDay = monday.getDay(); // 0=Sunday
  monday.setDate(monday.getDate() - ((jsDay + 6) % 7)); // this week's Monday
  for (let i = WEEK_BUCKETS + WEEK_WARMUP - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    weekRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  // — Month: bucket = a calendar month —
  const monthRaw: ChartBucket[] = [];
  const now = new Date(`${today}T00:00:00`);
  for (let i = MONTH_BUCKETS + MONTH_WARMUP - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0); // the month's last day
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    monthRaw.push({
      date: startYmd,
      ratio: rangeRatio(habit, completedSet, startYmd, endYmd, today),
      score: 0,
      partial: endYmd > today,
    });
  }

  const endOfDay = (b: ChartBucket) => b.date;
  const endOfWeek = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return toYmd(d);
  };
  const endOfMonth = (b: ChartBucket) => {
    const d = new Date(`${b.date}T00:00:00`);
    return toYmd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  };

  // trimLeading only affects display (the score is 0 before the habit anyway).
  // Alpha depends on the bucket size so all tabs decay at the same calendar rate.
  const attachScores = (raw: ChartBucket[], alpha: number): ChartBucket[] => {
    const scores = emaScores(raw.map((b) => b.ratio), alpha);
    return raw.map((b, i) => ({ ...b, score: scores[i] }));
  };

  return {
    day: attachScores(trimLeading(dayRaw, endOfDay, firstDate), SCORE_EMA_ALPHA).slice(-DAY_BUCKETS),
    week: attachScores(trimLeading(weekRaw, endOfWeek, firstDate), SCORE_EMA_ALPHA_WEEK).slice(-WEEK_BUCKETS),
    month: attachScores(trimLeading(monthRaw, endOfMonth, firstDate), SCORE_EMA_ALPHA_MONTH).slice(-MONTH_BUCKETS),
  };
}
