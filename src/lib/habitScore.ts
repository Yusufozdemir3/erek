// The pure math behind the habit SCORE — no UI, testable (same rationale as
// timerLogic.ts / goalProjection.ts). Called by useHabitStats.
//
// MODEL (2026-07-23, user decision): the score STARTS AT ZERO and is EARNED.
// A brand-new habit doesn't show 100% even if day one is perfect; each
// completed bucket nudges the score a bit closer to the target, a missed
// bucket pulls it back. The reference behavior is Loop Habit Tracker (whose chart the user liked).
//
// Two input rules:
//   1) ratio = 0..1  -> the bucket updates the EMA (done / partially done / missed)
//   2) ratio = null  -> NEUTRAL bucket: the score isn't updated, it stays THE
//      SAME as the previous one. "Today wasn't this habit's day" is no longer
//      the same signal as "you were supposed to do it and didn't." A neutral
//      bucket isn't dropped from the array, it repeats the same score so the
//      line flows without a break (user request: "the chart should show continuity").
//
// — HISTORY: why there's NO bias correction —
// At one point (audit #21) the EMA was normalized with `acc / (1-(1-alpha)^t)`;
// the goal was to address the complaint "why does a 10-day-perfect habit show
// 51.6%." The side effect: the score would jump straight to 100% on the very
// first bucket — i.e. a score handed out up front rather than earned. The
// user chose the score that climbs from zero instead, and the correction was
// removed. #21's ACTUAL finding (that ghost buckets before the habit's birth
// were dragging the score down) disappears on its own under this model: the
// leading zeros already keep the score at 0, so the climb from the first real
// bucket onward is identical either way. Trimming
// (useHabitStats.trimLeading) is now purely for DISPLAY (not showing 10
// months of empty bars), it doesn't affect the math.
//
// KNOWN CONSEQUENCE: a "new and perfect" habit and a "long-struggling habit
// that's been recovering for the last 10 days" will show similar scores in
// the first weeks. This is the natural cost of the score being something
// earned — if you want to tell them apart, the Completion/streak cards already provide that distinction.
//
// At a coefficient of 0.2, a single day's impact felt too strong (user
// feedback) — lowered to 0.07. Half-life in the Day bucket is ~9.6 days.
export const SCORE_EMA_ALPHA = 0.07;

// CALENDAR-EQUIVALENT coefficients for the week and month buckets. Using a
// single alpha across all three tabs made the same habit show 94% on Day but
// 58% on Week (a contradiction on the same screen — users had reported this
// class of inconsistency before). Make a weekly bucket correspond to 7 days
// of decay, and a monthly bucket to 30 days:
export const SCORE_EMA_ALPHA_WEEK = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 7);
export const SCORE_EMA_ALPHA_MONTH = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 30);

// NOTE: There used to be a SCORE_MIN_DAYS=7 lock ("Score unlocks after 7
// days"). REMOVED (2026-07-23): the score is no longer handed out up front,
// it climbs from 0 — a low value in the early days isn't a misleading number,
// it's the model itself. The lock was hiding exactly the beginning of the climb it was meant to showcase.

// Ratio array -> a score array of the same length, 0..1. The score starts at 0.
// null = neutral bucket (score carries over, EMA isn't updated). An empty
// array returns empty. alpha belongs to the caller (differs for day/week/month — the constants above).
export function emaScores(
  ratios: Array<number | null>,
  alpha: number = SCORE_EMA_ALPHA
): number[] {
  const out: number[] = [];
  let score = 0;
  for (const r of ratios) {
    if (r !== null) score = score * (1 - alpha) + r * alpha;
    out.push(score);
  }
  return out;
}
