// The recap of a FINISHED goal (pure). An open goal's stats look forward (pace
// needed, projections); a finished one looks back, and every number is frozen
// at the completion day — "average per day" must not keep shrinking while the
// goal sits finished.

import { diffDays, toYmd } from './helpers';

export interface CompletionEntry {
  amount: number;
  updated_at: string; // ISO; only the date part is used
}

export interface CompletionInput {
  startDate: string | null;
  completedAt: string | null; // ISO instant; null (old data) = finished "today"
  deadline: string | null;
  isNumeric: boolean;
  currentValue: number;
  targetValue: number | null;
  entries: CompletionEntry[]; // any order
  milestonesDone: number;
  milestonesTotal: number;
  today: string; // "YYYY-MM-DD"
}

export interface CompletionSummary {
  startDay: string;
  endDay: string;
  durationDays: number; // both ends included, at least 1
  // Days the goal finished before (>0) / after (<0) its deadline; null = no deadline.
  deadlineGap: number | null;
  // Numeric only:
  total: number | null;          // what was reached (may pass the target)
  overTarget: number | null;     // total / target, e.g. 1.2 = 120%
  avgDaily: number | null;       // total / duration
  bestDay: { day: string; amount: number } | null; // the biggest single day
  activeDays: number | null;     // distinct days with progress added
  entryCount: number | null;
  // Any goal with steps:
  milestonesDone: number;
  milestonesTotal: number;
}

export function completionSummary(input: CompletionInput): CompletionSummary {
  const dayOf = (iso: string) => iso.slice(0, 10);
  const endDay = input.completedAt ? toYmd(new Date(input.completedAt)) : input.today;

  const sorted = [...input.entries].sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  const firstEntryDay = sorted.length > 0 ? dayOf(sorted[0].updated_at) : null;
  // Day zero as elsewhere (goalProjection): start_date, else the first entry.
  // A start after the finish (odd data) collapses to a one-day goal.
  let startDay = input.startDate ?? firstEntryDay ?? endDay;
  if (startDay > endDay) startDay = endDay;
  const durationDays = Math.max(1, diffDays(startDay, endDay) + 1);

  const base = {
    startDay,
    endDay,
    durationDays,
    deadlineGap: input.deadline ? diffDays(endDay, input.deadline) : null,
    milestonesDone: input.milestonesDone,
    milestonesTotal: input.milestonesTotal,
  };

  if (!input.isNumeric) {
    return { ...base, total: null, overTarget: null, avgDaily: null, bestDay: null, activeDays: null, entryCount: null };
  }

  // Progress only: corrections (negative) don't count as a "day of work".
  const perDay = new Map<string, number>();
  for (const e of sorted) {
    if (e.amount <= 0) continue;
    const d = dayOf(e.updated_at);
    perDay.set(d, (perDay.get(d) ?? 0) + e.amount);
  }
  let bestDay: { day: string; amount: number } | null = null;
  for (const [day, amount] of perDay) {
    if (!bestDay || amount > bestDay.amount) bestDay = { day, amount };
  }

  const total = input.currentValue;
  return {
    ...base,
    total,
    overTarget: input.targetValue && input.targetValue > 0 ? total / input.targetValue : null,
    avgDaily: total > 0 ? total / durationDays : null,
    bestDay,
    activeDays: perDay.size,
    entryCount: sorted.filter((e) => e.amount > 0).length,
  };
}
