// NEXT MILESTONE statistic — pure function (same rationale as
// goalProjection/habitSeries: no React, testable, time is a parameter).
//
// MODEL (user decision 2026-07-23): under the goal statistics, instead of an
// AGGREGATE summary of milestones (remaining steps / steps per day / per
// week), only the status of the NEXT milestone is shown. The question the
// user is actually asking at that moment isn't "how many steps are left in
// total" but "what am I working on right now, and am I on track".
//
// Next milestone = the first NOT-YET-REACHED milestone in the list (position
// order). For amount-based milestones, "reached" is derived from
// current_value (a cumulative threshold); for amount-less (checklist)
// milestones it comes from manual checking — see milestoneViews.

import { diffDays } from './helpers';
import type { MilestoneView } from '@/db';

export interface NextMilestoneStat {
  title: string;
  // — Populated for amount-based milestones; null for a checklist milestone —
  targetAmount: number | null; // the milestone's target
  remainingAmount: number | null; // how much is left to that target (never goes below 0)
  ratio: number; // 0..1 — the milestone's own completion ratio ("what percent are we at")
  // — Populated for milestones with a due date —
  dueDate: string | null;
  daysLeft: number | null; // negative means overdue
  isOverdue: boolean;
  overdueDays: number | null; // positive, populated only when isOverdue
}

// Statistic for the first unreached milestone; null if there are no milestones or all are completed.
export function nextMilestoneStat(
  views: MilestoneView[],
  currentValue: number,
  today: string
): NextMilestoneStat | null {
  const next = views.find((v) => !v.reached);
  if (!next) return null;

  const m = next.milestone;
  const targetAmount = m.amount != null && m.amount > 0 ? m.amount : null;
  const remainingAmount = targetAmount != null ? Math.max(0, targetAmount - currentValue) : null;

  const daysLeft = m.due_date ? diffDays(today, m.due_date) : null;
  const isOverdue = daysLeft != null && daysLeft < 0;

  return {
    title: m.title,
    targetAmount,
    remainingAmount,
    ratio: next.ratio,
    dueDate: m.due_date,
    daysLeft,
    isOverdue,
    overdueDays: isOverdue ? -daysLeft! : null,
  };
}
