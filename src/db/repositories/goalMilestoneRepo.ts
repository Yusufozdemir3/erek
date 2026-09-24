// Goal milestone (GoalMilestone) repository — the same basic pattern as subtaskRepo.
// There are two milestone modes (see models.GoalMilestone): checklist
// (milestone-type goal) and threshold (numeric goal + amount). UI never sees SQL.
// Every write refreshes updated_at and sets synced=0 (waiting for sync).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { GoalMilestone } from '../../types/models';

function rowToMilestone(row: any): GoalMilestone {
  return {
    id: row.id,
    goal_id: row.goal_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    amount: row.amount,
    due_date: row.due_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

// A threshold-mode milestone's view state (see milestoneViews).
export interface MilestoneView {
  milestone: GoalMilestone;
  ratio: number;    // 0..1 — the milestone's own fill ratio
  reached: boolean; // has the cumulative threshold been crossed (equivalent to `completed` in checklist mode)
}

// Milestone views for a NUMERIC goal: every milestone that has an amount is
// its OWN INDEPENDENT target (e.g. "first 5km", "first 20km", "first 50km" —
// all three are counted FROM ZERO, none shares another's share). The goal's
// current_value is the single entry point: one entry updates EVERY milestone
// it crosses/doesn't cross at the same time (entering 5km finishes the first
// milestone, and also advances the 20km and 50km milestones to 5/20 and
// 5/50) — there is NO "finish one, move to the next" ordering. Never checked
// off manually. Amount-less (legacy/checklist) milestones keep their own
// completed state. A pure function (no SQL) — called directly by both UI and tests.
export function milestoneViews(milestones: GoalMilestone[], currentValue: number): MilestoneView[] {
  return milestones.map((m) => {
    if (m.amount == null || m.amount <= 0) {
      return { milestone: m, ratio: m.completed === 1 ? 1 : 0, reached: m.completed === 1 };
    }
    const ratio = Math.max(0, Math.min(1, currentValue / m.amount));
    return { milestone: m, ratio, reached: currentValue >= m.amount };
  });
}

export const goalMilestoneRepo = {
  // New milestone; appended to the end of the list (position = current max + 1).
  // extra: the threshold amount for a numeric goal and/or an optional due date.
  create(
    goalId: string,
    title: string,
    extra: { amount?: number | null; due_date?: string | null } = {}
  ): GoalMilestone {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM goal_milestones WHERE goal_id = ?`,
      [goalId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    const amount = extra.amount ?? null;
    const due_date = extra.due_date ?? null;
    db.runSync(
      `INSERT INTO goal_milestones (id, goal_id, title, completed, position, amount, due_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL, 0)`,
      [id, goalId, title, position, amount, due_date, now]
    );
    return {
      id,
      goal_id: goalId,
      title,
      completed: 0,
      position,
      amount,
      due_date,
      updated_at: now,
      deleted_at: null,
      synced: 0,
    };
  },

  // A goal's active milestones, in the order they were added.
  listByGoal(goalId: string): GoalMilestone[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY position ASC`,
      [goalId]
    );
    return rows.map(rowToMilestone);
  },

  // For the "2/3" badge on goal cards: completed / total.
  countForGoal(goalId: string): { done: number; total: number } {
    const db = getDb();
    const row = db.getFirstSync<{ done: number; total: number }>(
      `SELECT COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL`,
      [goalId]
    );
    return { done: row?.done ?? 0, total: row?.total ?? 0 };
  },

  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    db.runSync(
      `UPDATE goal_milestones SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? 1 : 0, nowIso(), id]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE goal_milestones SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
  },
};
