// Task repository.
// UI never sees SQL - it only calls these functions.
// Every write refreshes updated_at and sets synced=0 (waiting for sync).

import { getDb } from '../database';
import { reminderRepo } from './reminderRepo';
import { subtaskRepo } from './subtaskRepo';
import { newId, nextTaskOccurrence, nowIso, parseJson, toJson, todayDate } from '../../lib/helpers';
import type { Task, Priority, Recurrence } from '../../types/models';

// Priority sort key: high->low.
const PRIORITY_RANK_SQL = `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

// Tasks with a time (due_date "YYYY-MM-DDTHH:MM:SS", length>10) come entirely
// first; among themselves they're sorted by TIME (chronologically). Timeless/
// all-day tasks ("YYYY-MM-DD") come entirely after; among themselves they're
// sorted ONLY by PRIORITY (even if their dates differ). The CASE expression
// produces NULL for timeless rows, making them all equal, so the date can't
// leak in and override priority.
const DUE_ORDER_SQL = `
  (length(due_date) <= 10) ASC,
  CASE WHEN length(due_date) > 10 THEN due_date END ASC,
  ${PRIORITY_RANK_SQL}
`;

// Converts a raw DB row into the app type (parses the recurrence JSON).
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
}

export const taskRepo = {
  // Creates a new task.
  create(input: CreateTaskInput): Task {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO tasks
       (id, user_id, title, due_date, end_time, priority, recurrence, remind_at, completed_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 0)`,
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
      ]
    );
    return this.getById(id)!;
  },

  // Fetches a single task by ID (non-deleted).
  getById(id: string): Task | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? rowToTask(row) : null;
  },

  // All of a user's active tasks (sorted by due date).
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

  // For the "Tasks" screen: ALL incomplete tasks + only the ones completed
  // since `completedSince`. Completed ones are already at the bottom of the list.
  //
  // WHY THE LIMIT EXISTS: listByUser returned EVERY task including completed
  // ones, and the screen drew all of them. Since a completed task never
  // dropped out, for someone using the app for a year the list reached the
  // thousands; both the query and the render grew linearly, and the actually
  // useful part (things to do) got lost in that pile. Active tasks are NOT
  // LIMITED — that's the user's real working set and it's naturally small.
  // If completedSince is null, no limit is applied ("show everything").
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

  // Count of tasks OUTSIDE the limit (completed at an older date) — the
  // screen's "show all" button only appears when something is genuinely hidden.
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

  // For the "Today" screen: incomplete tasks due today or earlier.
  listDueToday(userId: string, today: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND completed_at IS NULL
         AND due_date IS NOT NULL AND date(due_date) <= ?
       ORDER BY ${DUE_ORDER_SQL}`,
      [userId, today]
    );
    return rows.map(rowToTask);
  },

  // The list shown on the "Today" screen: unlike listDueToday, this also
  // returns tasks completed TODAY, so checking the box doesn't make the task
  // disappear — it stays in the list, checked/struck-through, for the rest of
  // the day, then drops off on its own the next day.
  // Completed ones sort to the bottom, incomplete ones sort to the top by due date.
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

  // Tasks due on a SPECIFIC day (including completed ones). For clearly
  // showing that day's tasks when navigating to another day on the "Today" screen.
  // Difference from listForToday: no cumulative "<=", just that exact day; it
  // doesn't get mixed up with tasks carried over from a past day.
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

  // Marks a task completed (or undoes it).
  //
  // A RECURRING task behaves differently on "complete" (completed=true): the
  // task ISN'T marked completed — it's FAST-FORWARDED to its next occurrence
  // instead (a deliberate choice: no separate copy/history is kept, the same
  // row moves forward). This way the task drops off today and reappears on its
  // next occurrence date; if it has subtasks, they're reset for a fresh
  // checklist. Undoing (completed=false) always goes through the normal path
  // (completed_at is cleared). If the rule is broken/unresolvable
  // (nextTaskOccurrence returns null), it falls back to normal completion.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
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

  // Updates task fields.
  update(id: string, fields: Partial<CreateTaskInput>): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.due_date !== undefined) { sets.push('due_date = ?'); vals.push(fields.due_date); }
    if (fields.end_time !== undefined) { sets.push('end_time = ?'); vals.push(fields.end_time); }
    if (fields.priority !== undefined) { sets.push('priority = ?'); vals.push(fields.priority); }
    if (fields.recurrence !== undefined) { sets.push('recurrence = ?'); vals.push(toJson(fields.recurrence)); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  // Soft delete - the record stays, deleted_at is stamped (so it doesn't come back via sync).
  // The task's reminder rows are cleaned up here too (rationale: habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
    reminderRepo.deleteAllForEntity('task', id);
  },
};
