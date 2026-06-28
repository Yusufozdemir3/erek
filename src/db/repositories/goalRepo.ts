// Hedef (Goal) repository.
// İki tip: 'numeric' (50/100 km gibi ilerleme) ve 'deadline' (tarihe kadar yapılacak).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { Goal, GoalType } from '../../types/models';

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    goal_type: row.goal_type as GoalType,
    target_value: row.target_value,
    current_value: row.current_value,
    unit: row.unit,
    deadline: row.deadline,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export interface CreateGoalInput {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
}

export const goalRepo = {
  create(input: CreateGoalInput): Goal {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goals
       (id, user_id, title, goal_type, target_value, current_value, unit, deadline, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.title, input.goal_type,
       input.target_value ?? null, input.unit ?? null, input.deadline ?? null, now]
    );
    return this.getById(id)!;
  },

  getById(id: string): Goal | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL`, [id]
    );
    return row ? rowToGoal(row) : null;
  },

  listByUser(userId: string): Goal[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToGoal);
  },

  // Sayısal hedefte ilerlemeyi artırır (örn. +5 km). Hedefi aşmaz.
  addProgress(id: string, amount: number): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal) return;
    let next = goal.current_value + amount;
    if (goal.target_value != null && next > goal.target_value) {
      next = goal.target_value;
    }
    if (next < 0) next = 0;
    db.runSync(
      `UPDATE goals SET current_value = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [next, nowIso(), id]
    );
  },

  // 0-1 arası ilerleme oranı. UI yüzde göstergesi için.
  progressRatio(goal: Goal): number {
    if (goal.goal_type === 'numeric' && goal.target_value && goal.target_value > 0) {
      return Math.min(1, goal.current_value / goal.target_value);
    }
    return 0;
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE goals SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
  },
};
