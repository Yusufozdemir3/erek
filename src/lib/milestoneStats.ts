// The goal stats show only the NEXT milestone — "what am I working on, am I on
// track" — rather than totals. Next = the first one not yet reached, in
// position order (milestoneViews decides "reached"). Pure; time is a parameter.

import { diffDays } from './helpers';
import type { MilestoneView } from '@/db';

export interface NextMilestoneStat {
  title: string;
  // Amount-based milestones only (null for checklist ones):
  targetAmount: number | null; // the milestone's target
  remainingAmount: number | null; // never below 0
  ratio: number; // 0..1
  // Milestones with a due date only:
  dueDate: string | null;
  daysLeft: number | null; // negative means overdue
  isOverdue: boolean;
  overdueDays: number | null; // positive, populated only when isOverdue
}

// null when there are no milestones or all are reached.
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
