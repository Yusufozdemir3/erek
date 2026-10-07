// Goals: 'numeric' (50/100 km) or 'milestone' (steps, like a task's subtasks);
// either may have a deadline.

import { getDb } from '../database';
import { newId, nowIso, todayDate } from '../../lib/helpers';
import { goalEntryRepo } from './goalEntryRepo';
import { reminderRepo } from './reminderRepo';
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
    completed_at: row.completed_at,
    remind_at: row.remind_at,
    start_date: row.start_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
    value_baseline: row.value_baseline ?? 0,
  };
}

// The one place current_value is derived (migration019):
//   current_value = max(0, value_baseline + sum of live entries)
// The floor matters when two devices each apply a negative correction.
// bumpSync: true after a user action; false for the post-pull recompute, or
// every round would re-push every goal.
function recompute(id: string, bumpSync: boolean): void {
  const db = getDb();
  const sums = bumpSync ? ', updated_at = ?, synced = 0' : '';
  const vals = bumpSync ? [nowIso(), id] : [id];
  db.runSync(
    `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
       SELECT SUM(amount) FROM goal_entries
        WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
     ), 0))${sums} WHERE id = ?`,
    vals
  );
}

export interface CreateGoalInput {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
  start_date?: string | null; // defaults to today (day zero of the pace)
}

export const goalRepo = {
  create(input: CreateGoalInput): Goal {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goals
       (id, user_id, title, goal_type, target_value, current_value, unit, deadline, remind_at, start_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.title, input.goal_type,
       input.target_value ?? null, input.unit ?? null, input.deadline ?? null,
       input.remind_at ?? null, input.start_date ?? todayDate(), now]
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

  // goal_type never changes (the fields would no longer fit). current_value is
  // floored at 0 but has no ceiling: lowering the target must not erase progress.
  update(
    id: string,
    fields: Partial<{
      title: string;
      target_value: number | null;
      unit: string | null;
      deadline: string | null;
      remind_at: string | null;
      start_date: string | null;
      current_value: number;
      // GoalForm's checkbox: log a manual "Current value" change as progress.
      log_manual_change: boolean;
    }>
  ): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.target_value !== undefined) { sets.push('target_value = ?'); vals.push(fields.target_value); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.deadline !== undefined) { sets.push('deadline = ?'); vals.push(fields.deadline); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    // current_value is derived, so a manual change goes to exactly ONE of:
    //   log_manual_change=false (silent correction) -> the baseline; it's not
    //     a day's work and mustn't inflate the pace;
    //   log_manual_change=true -> an entry; the baseline stays.
    // Doing both would count the difference twice.
    const requested = fields.current_value !== undefined ? Math.max(0, fields.current_value) : null;
    if (sets.length === 0 && requested === null) return;
    const before = requested !== null ? this.getById(id)?.current_value ?? 0 : 0;
    if (sets.length > 0) {
      sets.push('updated_at = ?'); vals.push(nowIso());
      sets.push('synced = 0');
      vals.push(id);
      db.runSync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (requested !== null) {
      const delta = requested - before;
      if (fields.log_manual_change) {
        if (delta !== 0) goalEntryRepo.create(id, delta);
      } else {
        db.runSync(
          `UPDATE goals SET value_baseline = ? - COALESCE((
             SELECT SUM(amount) FROM goal_entries
              WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
           ), 0) WHERE id = ?`,
          [requested, id]
        );
      }
      recompute(id, true);
    }
  },

  // Changes a numeric goal's progress by a delta (+5 km, -1 correction) and
  // records it as an entry — the one write path for manual adds, linked habits
  // and the timer, so every contribution shows in the history and the pace.
  //
  // No ceiling: progress is an honest counter and may pass the target (the
  // displays clamp ratios themselves). A ceiling once pulled progress
  // backward when already past the target, and made a linked habit's +1/-1
  // asymmetric on a full goal. Only the 0 floor remains.
  //
  // Returns the delta actually applied (the floor can shrink it); that is
  // what the entry records. Ignored for 'milestone' goals.
  addProgress(id: string, amount: number): number {
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'numeric') return 0;
    const next = Math.max(0, goal.current_value + amount);
    const applied = next - goal.current_value;
    if (applied === 0) return 0;
    // Entry first, then recompute: current_value is derived from the entries.
    goalEntryRepo.create(id, applied);
    recompute(id, true);
    return applied;
  },

  // 0–1, for the UI.
  progressRatio(goal: Goal): number {
    if (goal.goal_type === 'numeric' && goal.target_value && goal.target_value > 0) {
      return Math.min(1, goal.current_value / goal.target_value);
    }
    return 0;
  },

  // 'numeric': from the ratio; 'milestone': completed_at (set by hand or when
  // every step is done).
  isCompleted(goal: Goal): boolean {
    return goal.goal_type === 'numeric' ? this.progressRatio(goal) >= 1 : goal.completed_at != null;
  },

  // 'milestone' goals only; ignored for numeric ones.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'milestone') return;
    db.runSync(
      `UPDATE goals SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  // After a pull (syncEngine.runSync): pulled entries/baselines may change the
  // total, and the pulled current_value is a stale cache. Leaves synced alone.
  recomputeAllFromEntries(): void {
    const db = getDb();
    db.runSync(
      `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
         SELECT SUM(amount) FROM goal_entries
          WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
       ), 0))`
    );
  },

  // Takes its reminder rows along (see habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE goals SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
    reminderRepo.deleteAllForEntity('goal', id);
  },

  // Undoes softDelete, reminders included; the newer updated_at wins over the
  // deletion already synced. false if the row isn't deleted.
  restore(id: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<{ deleted_at: string | null }>(`SELECT deleted_at FROM goals WHERE id = ?`, [id]);
    if (!row?.deleted_at) return false;
    db.runSync(`UPDATE goals SET deleted_at = NULL, updated_at = ?, synced = 0 WHERE id = ?`, [nowIso(), id]);
    reminderRepo.restoreForEntity('goal', id, row.deleted_at);
    return true;
  },
};
