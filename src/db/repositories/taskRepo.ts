// Tasks.

import { getDb } from '../database';
import { reminderRepo } from './reminderRepo';
import { subtaskRepo } from './subtaskRepo';
import { chunk, newId, nextTaskOccurrence, nowIso, parseJson, toJson, todayDate } from '../../lib/helpers';
import type { Task, Priority, Recurrence } from '../../types/models';

// Priority sort key: high->low.
const PRIORITY_RANK_SQL = `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

// Timed tasks (due_date "YYYY-MM-DDTHH:MM:SS") first, chronologically; then
// all-day ones by priority only. The CASE yields NULL for all-day rows so
// their dates can't override priority.
const DUE_ORDER_SQL = `
  (length(due_date) <= 10) ASC,
  CASE WHEN length(due_date) > 10 THEN due_date END ASC,
  ${PRIORITY_RANK_SQL}
`;

function rowToTask(row: any): Task {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    due_date: row.due_date,
    end_time: row.end_time,
    priority: row.priority as Priority,
    recurrence: parseJson<Recurrence>(row.recurrence),
    remind_at: row.remind_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
    shared_with_id: row.shared_with_id ?? null,
    shared_owner_uid: row.shared_owner_uid ?? null,
  };
}

export interface CreateTaskInput {
  user_id: string;
  title: string;
  due_date?: string | null;
  end_time?: string | null;
  priority?: Priority;
  recurrence?: Recurrence | null;
  remind_at?: string | null;
  shared_with_id?: string | null; // friend's cloud uid; ignored for recurring tasks
}

// A task shared WITH me is someone else's: local edits would be pushed,
// rejected and wedge sync. They're dropped with a warning, not thrown (an
// uncaught throw in a handler closes a release build).
function isSharedWithMe(id: string): boolean {
  const row = getDb().getFirstSync<{ shared_owner_uid: string | null }>(
    `SELECT shared_owner_uid FROM tasks WHERE id = ?`,
    [id]
  );
  if (row?.shared_owner_uid) {
    console.warn('[taskRepo] Ignored a local edit to a task shared with this user:', id);
    return true;
  }
  return false;
}

export const taskRepo = {
  create(input: CreateTaskInput): Task {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO tasks
       (id, user_id, title, due_date, end_time, priority, recurrence, remind_at, completed_at, updated_at, deleted_at, synced, shared_with_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 0, ?)`,
      [
        id,
        input.user_id,
        input.title,
        input.due_date ?? null,
        input.end_time ?? null,
        input.priority ?? 'medium',
        toJson(input.recurrence ?? null),
        input.remind_at ?? null,
        now,
        // Mirrors the server guard: recurring tasks can't be shared.
        input.recurrence ? null : input.shared_with_id ?? null,
      ]
    );
    return this.getById(id)!;
  },

  getById(id: string): Task | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? rowToTask(row) : null;
  },

  listByUser(userId: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY (due_date IS NULL), ${DUE_ORDER_SQL}`,
      [userId]
    );
    return rows.map(rowToTask);
  },

  // The Tasks screen: every open task plus those completed since
  // `completedSince` (null = all), so a year of finished tasks doesn't bury
  // the open ones. Completed ones sort last.
  listForScreen(userId: string, completedSince: string | null): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND (completed_at IS NULL OR ?2 IS NULL OR date(completed_at, 'localtime') >= ?2)
       ORDER BY (completed_at IS NOT NULL), (due_date IS NULL), ${DUE_ORDER_SQL}`,
      [userId, completedSince]
    );
    return rows.map(rowToTask);
  },

  // Local days the user's OWN tasks were finished on, one per task (weekly review).
  completedDatesBetween(userId: string, startYmd: string, endYmd: string): string[] {
    const db = getDb();
    return db
      .getAllSync<{ d: string }>(
        `SELECT date(completed_at, 'localtime') AS d FROM tasks
         WHERE user_id = ? AND deleted_at IS NULL AND shared_owner_uid IS NULL
           AND completed_at IS NOT NULL
           AND date(completed_at, 'localtime') BETWEEN ? AND ?`,
        [userId, startYmd, endYmd]
      )
      .map((r) => r.d);
  },

  // Completed tasks hidden by listForScreen's limit (for the "show all" button).
  countCompletedBefore(userId: string, since: string): number {
    const db = getDb();
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND completed_at IS NOT NULL AND date(completed_at, 'localtime') < ?`,
      [userId, since]
    );
    return row?.n ?? 0;
  },

  // Open tasks due today or earlier, plus ones completed today (a checked task
  // stays visible until tomorrow). Completed ones sort last.
  listForToday(userId: string, today: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND due_date IS NOT NULL
         AND (
           (completed_at IS NULL AND date(due_date) <= ?)
           OR (completed_at IS NOT NULL AND date(completed_at, 'localtime') = ?)
         )
       ORDER BY (completed_at IS NOT NULL), ${DUE_ORDER_SQL}`,
      [userId, today, today]
    );
    return rows.map(rowToTask);
  },

  // Tasks due exactly on `date`, completed included (Today on another day; no carry-over).
  listByDueDate(userId: string, date: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND due_date IS NOT NULL AND date(due_date) = ?
       ORDER BY (completed_at IS NOT NULL), ${DUE_ORDER_SQL}`,
      [userId, date]
    );
    return rows.map(rowToTask);
  },

  // Completing a RECURRING task moves the same row to its next occurrence
  // (subtasks unticked) instead of marking it done; an unresolvable rule falls
  // back to normal completion. Undoing always just clears completed_at.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    if (isSharedWithMe(id)) return;
    if (completed) {
      const task = this.getById(id);
      if (task && task.recurrence) {
        const today = todayDate();
        const next = nextTaskOccurrence(task.recurrence, task.due_date ?? today, today);
        if (next) {
          db.runSync(
            `UPDATE tasks SET due_date = ?, completed_at = NULL, updated_at = ?, synced = 0 WHERE id = ?`,
            [next, nowIso(), id]
          );
          subtaskRepo.reopenForTask(id);
          return;
        }
      }
    }
    db.runSync(
      `UPDATE tasks SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  update(id: string, fields: Partial<CreateTaskInput>): void {
    const db = getDb();
    if (isSharedWithMe(id)) return;
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.due_date !== undefined) { sets.push('due_date = ?'); vals.push(fields.due_date); }
    if (fields.end_time !== undefined) { sets.push('end_time = ?'); vals.push(fields.end_time); }
    if (fields.priority !== undefined) { sets.push('priority = ?'); vals.push(fields.priority); }
    if (fields.recurrence !== undefined) { sets.push('recurrence = ?'); vals.push(toJson(fields.recurrence)); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    // Recurring tasks can't be shared (mirrors the server guard).
    if (fields.recurrence) { sets.push('shared_with_id = NULL'); }
    else if (fields.shared_with_id !== undefined) { sets.push('shared_with_id = ?'); vals.push(fields.shared_with_id); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  // Takes its reminder rows along (see habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    if (isSharedWithMe(id)) return;
    const now = nowIso();
    db.runSync(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
    reminderRepo.deleteAllForEntity('task', id);
  },

  // Undoes softDelete, reminders included; the newer updated_at wins over the
  // deletion already synced. false if the row isn't deleted (or isn't the user's).
  restore(id: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<{ deleted_at: string | null }>(`SELECT deleted_at FROM tasks WHERE id = ?`, [id]);
    if (!row?.deleted_at) return false;
    if (isSharedWithMe(id)) return false;
    db.runSync(`UPDATE tasks SET deleted_at = NULL, updated_at = ?, synced = 0 WHERE id = ?`, [nowIso(), id]);
    reminderRepo.restoreForEntity('task', id, row.deleted_at);
    return true;
  },

  // Mirrors the server's answer for a task shared WITH me; synced stays 1
  // (it's the cloud row, not a local edit).
  applySharedCompletion(id: string, completedAt: string | null, updatedAt: string): void {
    getDb().runSync(
      `UPDATE tasks SET completed_at = ?, updated_at = ?, synced = 1
       WHERE id = ? AND shared_owner_uid IS NOT NULL`,
      [completedAt, updatedAt, id]
    );
  },

  listSharedWithMeIds(): string[] {
    return getDb()
      .getAllSync<{ id: string }>(`SELECT id FROM tasks WHERE shared_owner_uid IS NOT NULL`)
      .map((r) => r.id);
  },

  // Hard-deletes tasks shared WITH me (all, or `ids`): when a share ends, on
  // sign-out and account switch. No tombstone — they were never ours to push.
  purgeSharedWithMe(ids?: string[]): number {
    const db = getDb();
    const targets = ids ?? this.listSharedWithMeIds();
    for (const part of chunk(targets)) {
      const ph = part.map(() => '?').join(', ');
      db.runSync(`DELETE FROM subtasks WHERE task_id IN (${ph})`, part);
      db.runSync(`DELETE FROM reminders WHERE entity_type = 'task' AND entity_id IN (${ph})`, part);
      db.runSync(`DELETE FROM tasks WHERE shared_owner_uid IS NOT NULL AND id IN (${ph})`, part);
    }
    return targets.length;
  },

  // Any task shared either way? (gates the Today screen's freshness sync)
  hasSharedTasks(userId: string): boolean {
    const row = getDb().getFirstSync<{ n: number }>(
      `SELECT EXISTS (
         SELECT 1 FROM tasks
         WHERE user_id = ? AND deleted_at IS NULL
           AND (shared_owner_uid IS NOT NULL OR shared_with_id IS NOT NULL)
       ) AS n`,
      [userId]
    );
    return (row?.n ?? 0) === 1;
  },
};
