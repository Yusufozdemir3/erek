// DATA GENERATION for the score chart — a pure function, no dependency on
// React/expo-router (same rationale as timerLogic.ts / goalProjection.ts /
// habitScore.ts: so it can run in the fast 'logic' test project). Called by
// useHabitStats.
//
// MODEL (user decision 2026-07-23): the chart shows CONTINUITY ONLY.
//   - The same single question across all three habit types: was that day
//     COMPLETED? (no partial credit)
//   - The score starts at 0, climbs step by step, drops step by step (see habitScore.ts)
//   - An unscheduled day is NEUTRAL: the bucket stays in the array (the line
//     flows without a break) but neither raises nor lowers the score.

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
// Score (EMA) WARM-UP window — extra buckets BEFORE the displayed range, only
// to feed the EMA. These aren't shown on screen, they just let the first
// visible point reflect the accumulation from before it too.
const DAY_WARMUP = 60;
const WEEK_WARMUP = 12;
const MONTH_WARMUP = 12;

// Chart bucket: date = the bucket's start day ("YYYY-MM-DD"),
// score = the bucket's EMA score — what the score chart draws. If
// partial=true, the bucket hasn't FINISHED yet (today / the ongoing week-month)
// — shown faded on the chart.
export interface ChartBucket {
  date: string;
  // 0..1 raw ratio; null = NEUTRAL bucket (no scheduled day in that range). A
  // neutral bucket neither raises nor lowers the score — "today wasn't its
  // day" isn't a failure. The bucket still stays in the array so the line
  // flows without a break (see habitScore.ts).
  ratio: number | null;
  score: number;
  partial: boolean;
}

// Day/week/month series — the three views of the score chart on the stats screen.
export interface HabitChartSeries {
  day: ChartBucket[];
  week: ChartBucket[];
  month: ChartBucket[];
}

// The score chart asks the SAME QUESTION FOR ALL THREE HABIT TYPES: was that
// day completed or not. No binary/numeric/timer distinction — for numeric and
// timer, `completed` already means "the daily target was reached"
// (habitRepo.incrementAmount sets it to 1 once amount >= target).
//
// Numeric/timer habits used to have PARTIAL credit (amount/target): if 5 of 8
// glasses were drunk, the day counted as 0.625. Two problems: (1) a score
// that behaves differently per type, (2) that same day counted as 0 in the
// Week/Month bucket (rangeRatio only looks at completed=1) — contradicting the Day tab.
function dayRatio(log: HabitLog | undefined): number {
  return log?.completed === 1 ? 1 : 0;
}

// The ratio of scheduled days / completed days between two dates (inclusive).
// Future days aren't counted (haven't happened yet). Returns null if there
// are NO scheduled days at all in the range = a neutral bucket (the habit
// either hasn't started yet in that period, has ended, or none of its days
// fall in that range) — this must not lower the score.
// Under a QUOTA rule (X times a week), the denominator is quota/7 per day —
// a full quota for a full week, proportional for a partial range (an
// approximation that doesn't respect week boundaries).
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
    if (isScheduledOn(habit.schedule, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
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

// Drop the empty buckets at the start of the series that end entirely before
// the habit's "birth" (first log / start_date) — don't show 10 months of
// empty bars for a new habit.
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

  // — Day: bucket = a single day. For a QUOTA habit (X times a week), instead
  // of the day's RAW 0/1 state, "this week's ratio so far" is used —
  // otherwise even a habit that's hitting its weekly quota would look
  // consistently low-scoring on the Day tab (a misleading view that
  // contradicts the Week/Month tabs — reported by users).
  //
  // A day that is NOT scheduled (or falls outside the start/end range) is 0
  // not NEUTRAL (null): a habit scheduled Mon/Wed/Fri that never missed used
  // to show 42.7% on the Day tab — because the other 4 days of the week
  // counted as "didn't do it" — while the same screen's Week/Month tabs said
  // 100% (rangeRatio doesn't count an unscheduled day in the denominator). The
  // bucket is NOT DROPPED from the array, it passes through as neutral: the
  // line runs flat on those days, and the x-axis stays daily.
  const dayDates = lastDays(DAY_BUCKETS + DAY_WARMUP);
  const dayRaw: ChartBucket[] = dayDates.map((date) => {
    const ratio = quota
      ? rangeRatio(habit, completedSet, weekStartOf(date), date, today)
      : isScheduledOn(habit.schedule, date) && isWithinHabitDates(habit.start_date, habit.end_date, date)
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

  // The score starts at 0 and is earned (see habitScore.ts). Trimming
  // (trimLeading) is now purely for DISPLAY — the zeros before the habit's
  // birth would already have kept the score at 0 anyway, so it doesn't change
  // the math; the goal is just not showing 10 months of empty buckets.
  // Alpha varies with bucket size so all three tabs decay at the same calendar rate.
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
