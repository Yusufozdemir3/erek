// Subtask repository — a simple checklist.
// UI never sees SQL - it only calls these functions.
// Every write refreshes updated_at and sets synced=0 (waiting for sync).

import { getDb } from '../database';
import { chunk, newId, nowIso } from '../../lib/helpers';
import type { Subtask } from '../../types/models';

function rowToSubtask(row: any): Subtask {
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const subtaskRepo = {
  // New subtask; appended to the end of the list (position = current max + 1).
  create(taskId: string, title: string): Subtask {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM subtasks WHERE task_id = ?`,
      [taskId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    db.runSync(
      `INSERT INTO subtasks (id, task_id, title, completed, position, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, 0, ?, ?, NULL, 0)`,
      [id, taskId, title, position, now]
    );
    return {
      id,
      task_id: taskId,
      title,
      completed: 0,
      position,
      updated_at: now,
      deleted_at: null,
      synced: 0,
    };
  },

  // A task's active subtasks, in the order they were added.
  listByTask(taskId: string): Subtask[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY position ASC`,
      [taskId]
    );
    return rows.map(rowToSubtask);
  },

  // For the "2/3" badge on task cards: completed / total.
  countForTask(taskId: string): { done: number; total: number } {
    const db = getDb();
    const row = db.getFirstSync<{ done: number; total: number }>(
      `SELECT COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    return { done: row?.done ?? 0, total: row?.total ?? 0 };
  },

  // The MULTI version of countForTask: a list screen (Today/Tasks) gets all
  // badge counts in a single GROUP BY instead of a per-task query (N+1). Only
  // tasks with at least one (non-deleted) subtask show up — a task with no
  // subtasks is absent from the result (the caller doesn't need a "total > 0" filter).
  countsForTasks(taskIds: string[]): Record<string, { done: number; total: number }> {
    const db = getDb();
    const out: Record<string, { done: number; total: number }> = {};
    // Chunked: the number of bound `IN (…)` parameters equals the list length (see helpers.chunk).
    for (const ids of chunk(taskIds)) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.getAllSync<{ task_id: string; done: number; total: number }>(
        `SELECT task_id, COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
         FROM subtasks WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
         GROUP BY task_id`,
        ids
      );
      for (const r of rows) out[r.task_id] = { done: r.done ?? 0, total: r.total ?? 0 };
    }
    return out;
  },

  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    db.runSync(
      `UPDATE subtasks SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? 1 : 0, nowIso(), id]
    );
  },

  // Resets (reopens) a task's COMPLETED subtasks. Called when a recurring task
  // fast-forwards to its next occurrence — the new occurrence should start
  // with a fresh (all unchecked) checklist. Only touches completed=1 rows;
  // doesn't create unnecessary sync churn on ones that were already unchecked.
  reopenForTask(taskId: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE subtasks SET completed = 0, updated_at = ?, synced = 0
       WHERE task_id = ? AND deleted_at IS NULL AND completed = 1`,
      [nowIso(), taskId]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE subtasks SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
  },
};
