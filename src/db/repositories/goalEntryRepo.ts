// Goal entry history (GoalEntry) repository — the same pattern as goalMilestoneRepo.
// UI never sees SQL - it only calls these functions.
// IMPORTANT: this table is only a LOG. goal.current_value remains the single
// source of truth (updated via goalRepo.addProgress); records here exist only
// to show the user the "how much was added when" history.

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { GoalEntry } from '../../types/models';

function rowToEntry(row: any): GoalEntry {
  return {
    id: row.id,
    goal_id: row.goal_id,
    amount: row.amount,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const goalEntryRepo = {
  // New entry record (log only — doesn't change current_value; the caller
  // must also call goalRepo.addProgress).
  create(goalId: string, amount: number): GoalEntry {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goal_entries (id, goal_id, amount, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, NULL, 0)`,
      [id, goalId, amount, now]
    );
    return { id, goal_id: goalId, amount, updated_at: now, deleted_at: null, synced: 0 };
  },

  // A goal's entry history, newest first.
  listByGoal(goalId: string): GoalEntry[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goal_entries WHERE goal_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [goalId]
    );
    return rows.map(rowToEntry);
  },
};
