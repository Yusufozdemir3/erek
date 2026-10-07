// Pace and projections for a numeric goal (pure; `today` is a parameter).
// Everything runs along the goal's start → deadline axis:
//
//   start ─────────── today ─────────── deadline
//   |<-- days elapsed -->|<-- days left -->|
//
//   • avgDaily            = current / days elapsed — the whole lifetime, so a
//                           negative correction doesn't wipe out the pace
//   • last7Total          = entries of the last 7 days (windowed on purpose)
//   • projectedFinishDate = today + remaining / avgDaily
//   • projectedAtDeadline = current + avgDaily × days left
//   • behindAmount        = target − projectedAtDeadline (>0 short, <0 ahead)
//
// Once the deadline has passed, the "projection" is what actually happened
// (the current value), so the cards stay when the user is most behind.

import { diffDays, toYmd } from './helpers';

export interface GoalEntryLike {
  amount: number;
  updated_at: string; // ISO; only the date part is used
}

export interface ProjectionInput {
  entries: GoalEntryLike[]; // goalEntryRepo order: newest to oldest
  target: number | null;
  current: number;
  remaining: number | null; // target − current (numeric); null if unavailable
  daysLeft: number | null; // days left until the deadline (negative if past)
  completed: boolean;
  today: string; // "YYYY-MM-DD"
  startDate?: string | null; // goals.start_date; older goals fall back to the first entry
}

export interface Projection {
  avgDaily: number | null; // realized daily rate (current / days elapsed)
  daysElapsed: number | null; // from start to today, today INCLUDED
  last7Total: number | null; // total entered in the last 7 days
  projectedFinishDate: string | null; // finish day "at this rate"
  projectedAtDeadline: number | null; // amount at the deadline (if passed: what actually happened)
  behindAmount: number | null; // >0 shortfall at the deadline, <0 surplus
}

const EMPTY: Projection = {
  avgDaily: null,
  daysElapsed: null,
  last7Total: null,
  projectedFinishDate: null,
  projectedAtDeadline: null,
  behindAmount: null,
};

// Beyond this (a tiny rate gives dates centuries away, even NaN) no finish date is shown.
const MAX_PROJECTION_DAYS = 3650; // 10 years

export function goalProjection(input: ProjectionInput): Projection {
  const { entries, target, current, remaining, daysLeft, completed, today, startDate } = input;

  const dayOf = (iso: string) => iso.slice(0, 10);
  // Day zero: start_date, else the first entry, else nothing to compute.
  const firstEntryDay = entries.length > 0 ? dayOf(entries[entries.length - 1].updated_at) : null;
  const zeroDay = startDate ?? firstEntryDay;
  if (!zeroDay) return EMPTY;

  // Both ends included (opened today = 1 day); at least 1.
  const daysElapsed = Math.max(1, diffDays(zeroDay, today) + 1);

  const shiftDay = (days: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toYmd(d);
  };

  // The window can't exceed the goal's lifetime.
  const window7 = Math.min(7, daysElapsed);
  const since = shiftDay(-(window7 - 1));
  const last7Total = entries
    .filter((e) => dayOf(e.updated_at) >= since)
    .reduce((s, e) => s + e.amount, 0);

  const avgDaily = current > 0 ? current / daysElapsed : null;

  let projectedFinishDate: string | null = null;
  let projectedAtDeadline: number | null = null;
  let behindAmount: number | null = null;

  if (!completed && remaining != null && remaining > 0 && avgDaily != null && avgDaily > 0) {
    const daysNeeded = Math.ceil(remaining / avgDaily);
    if (daysNeeded <= MAX_PROJECTION_DAYS) projectedFinishDate = shiftDay(daysNeeded);
  }

  if (daysLeft != null && target != null) {
    // Extrapolate only while the goal is open: past the deadline the value is
    // what happened, and a completed goal's "will I make it?" is answered.
    const extrapolate = daysLeft >= 0 && !completed;
    projectedAtDeadline = extrapolate ? current + (avgDaily ?? 0) * daysLeft : current;
    behindAmount = target - projectedAtDeadline;
  }

  return {
    avgDaily,
    daysElapsed,
    last7Total,
    projectedFinishDate,
    projectedAtDeadline,
    behindAmount,
  };
}
