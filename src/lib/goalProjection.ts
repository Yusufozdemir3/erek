// Pace + projections for a numeric goal — a pure, deterministic (today is a
// parameter) function. Called by useGoalStats; keeping it separate makes it
// testable (same rationale as timerLogic.ts / habitSeries.ts).
//
// MODEL (user decision 2026-07-23): a goal's START and END DATE are now
// REQUIRED (see GoalForm — both come pre-filled with today), so all
// calculations are done along the axis drawn by these two dates:
//
//   start ─────────── today ─────────── end date
//   |<-- days elapsed -->|<-- days left -->|
//
//   • avgDaily ("how much am I doing per day") = current / days elapsed.
//     NOT a rolling 7/30-day window: the realized rate over the goal's entire
//     lifetime. Since it doesn't depend on entry history, undoing an amount
//     (a negative correction) doesn't zero out the pace and make the cards
//     disappear — in the old behavior, once the last 7 days' net dropped to
//     <= 0, the whole "your pace" group would vanish entirely.
//   • last7Total ("how much have I done in the last 7 days") comes from entry
//     history; this is deliberately windowed, because the question itself is windowed.
//   • projectedFinishDate ("at this rate, when will I finish") = today + remaining/avgDaily
//   • projectedAtDeadline ("at this rate, what will the amount be by the deadline") = current + avgDaily × days left
//   • behindAmount = target − projectedAtDeadline (>0 shortfall, <0 surplus)
//
// IF THE DEADLINE HAS PASSED: the projection stops being an "estimate" and
// becomes what ACTUALLY HAPPENED — the amount at the deadline is now the
// current value, and the shortfall is the remaining amount. In the old
// behavior both would drop to null in this case, meaning the cards would
// disappear from the screen exactly when the user was most behind.

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
  startDate?: string | null; // goals.start_date (required); falls back to the oldest entry if missing
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

// Upper bound for the estimated finish date. At a very tiny rate (e.g. 0.001
// per day) the math produces a date centuries away; at the extreme, Date
// overflows and prints "NaN-NaN-NaN". Beyond this bound means "won't finish
// at this rate" — no date is shown.
const MAX_PROJECTION_DAYS = 3650; // 10 years

export function goalProjection(input: ProjectionInput): Projection {
  const { entries, target, current, remaining, daysLeft, completed, today, startDate } = input;

  const dayOf = (iso: string) => iso.slice(0, 10);
  // Day zero: the goal's start date. For older goals (created before
  // start_date was added), falls back to the oldest entry's day; if that's
  // also missing, no calculation can be done.
  const firstEntryDay = entries.length > 0 ? dayOf(entries[entries.length - 1].updated_at) : null;
  const zeroDay = startDate ?? firstEntryDay;
  if (!zeroDay) return EMPTY;

  // Days elapsed: both the start day and today are included (a goal opened
  // today = 1 day). For a future start date (a not-yet-started goal), at
  // least 1 is assumed.
  const daysElapsed = Math.max(1, diffDays(zeroDay, today) + 1);

  const shiftDay = (days: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toYmd(d);
  };

  // "How much have I done in the last 7 days" — the window can't exceed the goal's lifetime.
  const window7 = Math.min(7, daysElapsed);
  const since = shiftDay(-(window7 - 1));
  const last7Total = entries
    .filter((e) => dayOf(e.updated_at) >= since)
    .reduce((s, e) => s + e.amount, 0);

  // "How much am I doing per day" — the realized rate over the goal's entire lifetime.
  const avgDaily = current > 0 ? current / daysElapsed : null;

  let projectedFinishDate: string | null = null;
  let projectedAtDeadline: number | null = null;
  let behindAmount: number | null = null;

  if (!completed && remaining != null && remaining > 0 && avgDaily != null && avgDaily > 0) {
    const daysNeeded = Math.ceil(remaining / avgDaily);
    if (daysNeeded <= MAX_PROJECTION_DAYS) projectedFinishDate = shiftDay(daysNeeded);
  }

  if (daysLeft != null && target != null) {
    // Forward projection is ONLY meaningful while the goal is still open:
    //   • if the deadline has passed, it's not an estimate but what ACTUALLY
    //     HAPPENED (the amount on hand that day),
    //   • if the goal is completed, no extrapolation is done: telling the
    //     user of a finished goal "you'll be 90 over by the deadline" is
    //     meaningless — the question they were asking ("will I make it?") has
    //     already been answered.
    // (This note used to say "addProgress clamps the amount to the goal"; that
    // cap was removed on 2026-08-03 — the counter can now honestly exceed the goal.)
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
