// The habit score (pure). It starts at ZERO and is earned, like Loop Habit
// Tracker: each completed bucket moves it toward 100%, a missed one pulls it
// back, and a neutral bucket (ratio null, nothing scheduled) repeats the
// previous score so the line continues. No bias correction: that would hand
// out 100% on day one. A new perfect habit and a recovering one therefore
// look alike at first; the completion and streak cards tell them apart.
//
// Alpha 0.07 → a day's half-life of about 9.6 days.

export const SCORE_EMA_ALPHA = 0.07;

// Week/month buckets decay like 7 and 30 days, so every tab agrees.
export const SCORE_EMA_ALPHA_WEEK = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 7);
export const SCORE_EMA_ALPHA_MONTH = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 30);

// Ratios -> scores (0..1, starting at 0); null carries the previous score.
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
