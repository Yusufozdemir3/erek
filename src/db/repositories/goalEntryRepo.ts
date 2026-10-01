// Goal entry history (GoalEntry) repository — the same pattern as goalMilestoneRepo.
// UI never sees SQL - it only calls these functions.
// Since migration019 these rows ARE the source of a goal's progress:
// current_value = value_baseline + sum of active entries (see goalRepo). Write
// entries through goalRepo.addProgress, which also re-derives current_value —
// creating one here alone leaves the cached total stale until the next sync.

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
    added_by: row.added_by ?? null,
  };
}

export const goalEntryRepo = {
  // New entry record. Doesn't re-derive current_value on its own — see the
  // file header (goalRepo.addProgress / goalRepo.update are the callers).
  create(goalId: string, amount: number): GoalEntry {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goal_entries (id, goal_id, amount, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, NULL, 0)`,
      [id, goalId, amount, now]
    );
    return { id, goal_id: goalId, amount, updated_at: now, deleted_at: null, synced: 0, added_by: null };
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
