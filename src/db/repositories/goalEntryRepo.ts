// Goal entries — since migration019 the source of a goal's progress
// (current_value = value_baseline + live entries). Write them through
// goalRepo.addProgress, which also re-derives current_value.

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
  // Doesn't re-derive current_value (see the header).
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

  // Newest first.
  listByGoal(goalId: string): GoalEntry[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goal_entries WHERE goal_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [goalId]
    );
    return rows.map(rowToEntry);
  },
};
