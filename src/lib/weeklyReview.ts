// The weekly review: how the last 7 days went, from data already on the phone.
// Pure logic (the screen feeds it from the repos); nothing leaves the device.
//
// THE WINDOW is the 7 days ending today, so it's always available — a
// Monday-to-Sunday "last week" would be empty on a Tuesday. The previous 7
// days give the trend.
//
// WHAT COUNTS: for each day, the habits scheduled that day (frequency + life
// range), done or not. A QUOTA habit ("3 times a week") has no fixed days: it
// expects its weekly target in the window and can't exceed it, so doing it
// every day doesn't inflate the rate and missing a rest day doesn't hurt.
// Tasks are only counted as "finished this week" — one with no due date has no
// day to be missed on, so it never lowers the rate.

import type { Recurrence } from '@/types/models';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates, toYmd } from '@/lib/helpers';

export const WINDOW_DAYS = 7;
// A habit needs at least this many expected days to be called "best" or
// "needs attention" — one miss out of one is not a pattern.
export const MIN_EXPECTED_FOR_RANKING = 3;

export interface ReviewHabit {
  id: string;
  title: string;
  schedule: Recurrence | null;
  start_date: string | null;
  end_date: string | null;
  skip_dates?: string[] | null;
}

export interface ReviewInput {
  habits: ReviewHabit[];
  completed: Record<string, Set<string>>; // habit id -> days marked done (a range covering both windows)
  taskDoneDates: string[]; // "YYYY-MM-DD" a task was finished on
  today: string;
}

export interface DayStat {
  date: string;
  scheduled: number;
  done: number;
}

export interface HabitStat {
  id: string;
  title: string;
  expected: number;
  done: number;
  rate: number; // 0-100
}

export interface Review {
  days: DayStat[]; // oldest -> today
  rate: number | null; // 0-100; null when nothing was scheduled
  prevRate: number | null;
  delta: number | null; // percentage points vs the previous window
  perfectDays: number; // days with every scheduled (non-quota) habit done
  tasksDone: number;
  best: HabitStat | null;
  needsAttention: HabitStat | null;
  habits: HabitStat[]; // best rate first
}

function shift(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

function windowDays(end: string): string[] {
  return Array.from({ length: WINDOW_DAYS }, (_, i) => shift(end, i - (WINDOW_DAYS - 1)));
}

interface WindowResult {
  days: DayStat[];
  habits: HabitStat[];
  expected: number;
  done: number;
}

function measure(input: ReviewInput, end: string): WindowResult {
  const dates = windowDays(end);
  const days: DayStat[] = dates.map((date) => ({ date, scheduled: 0, done: 0 }));
  const habits: HabitStat[] = [];
  let expected = 0;
  let done = 0;

  for (const h of input.habits) {
    const marks = input.completed[h.id] ?? new Set<string>();
    // Days of the window inside the habit's life range.
    const live = dates.filter((d) => isWithinHabitDates(h.start_date, h.end_date, d, h.skip_dates));
    if (live.length === 0) continue;

    let hExpected: number;
    let hDone: number;
    if (isQuotaSchedule(h.schedule)) {
      // Scale the weekly target to the days the habit existed in the window.
      hExpected = Math.max(1, Math.round(((h.schedule?.timesPerWeek ?? 0) * live.length) / WINDOW_DAYS));
      hDone = Math.min(hExpected, live.filter((d) => marks.has(d)).length);
    } else {
      const due = live.filter((d) => isScheduledOn(h.schedule, d));
      hExpected = due.length;
      hDone = due.filter((d) => marks.has(d)).length;
      for (const d of due) {
        const stat = days[dates.indexOf(d)];
        stat.scheduled++;
        if (marks.has(d)) stat.done++;
      }
    }
    if (hExpected === 0) continue;
    expected += hExpected;
    done += hDone;
    habits.push({
      id: h.id,
      title: h.title,
      expected: hExpected,
      done: hDone,
      rate: Math.round((hDone / hExpected) * 100),
    });
  }
  return { days, habits, expected, done };
}

const pct = (done: number, expected: number): number | null =>
  expected === 0 ? null : Math.round((done / expected) * 100);

export function buildReview(input: ReviewInput): Review {
  const cur = measure(input, input.today);
  const prev = measure(input, shift(input.today, -WINDOW_DAYS));
  const rate = pct(cur.done, cur.expected);
  const prevRate = pct(prev.done, prev.expected);

  const habits = [...cur.habits].sort(
    (a, b) => b.rate - a.rate || b.expected - a.expected || a.title.localeCompare(b.title)
  );
  const ranked = habits.filter((h) => h.expected >= MIN_EXPECTED_FOR_RANKING);
  const best = ranked.find((h) => h.rate > 0) ?? null;
  // "Needs attention" must be a different habit from the best one and actually below par.
  const needsAttention = [...ranked].reverse().find((h) => h.rate < 100 && h.id !== best?.id) ?? null;

  const inWindow = new Set(windowDays(input.today));
  return {
    days: cur.days,
    rate,
    prevRate,
    delta: rate !== null && prevRate !== null ? rate - prevRate : null,
    perfectDays: cur.days.filter((d) => d.scheduled > 0 && d.done === d.scheduled).length,
    tasksDone: input.taskDoneDates.filter((d) => inWindow.has(d)).length,
    best,
    needsAttention,
    habits,
  };
}

// The Monday of today's week — one id per Monday-to-Sunday week.
export function reviewWeekKey(today: string): string {
  const back = (new Date(`${today}T00:00:00`).getDay() + 6) % 7; // Mon=0 ... Sun=6
  return shift(today, -back);
}

// Today shows a "your week is ready" card on Sunday and Monday.
export function isReviewDay(today: string): boolean {
  const day = new Date(`${today}T00:00:00`).getDay();
  return day === 0 || day === 1;
}

// The one-line verdict under the rate.
export function messageKey(rate: number): 'review.msgGreat' | 'review.msgGood' | 'review.msgStart' {
  return rate >= 80 ? 'review.msgGreat' : rate >= 50 ? 'review.msgGood' : 'review.msgStart';
}
