// Reminder repository — a habit/task/goal can have ZERO OR MORE reminder
// times (see models.Reminder). UI never sees SQL.
// replaceAll: replaces the existing records with the "HH:MM" list coming from
// the form — the simplest consistent approach (instead of individually
// adding/removing like subtask/milestone, the form submits its WHOLE list at
// once; see HabitForm/TaskForm/GoalForm).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { Reminder, ReminderEntityType } from '../../types/models';

function rowToReminder(row: any): Reminder {
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    time: row.time,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const reminderRepo = {
  // An entity's active reminders, ascending by time.
  listByEntity(entityType: ReminderEntityType, entityId: string): Reminder[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM reminders WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY time ASC`,
      [entityType, entityId]
    );
    return rows.map(rowToReminder);
  },

  // The MULTI version of listByEntity: at startup, when rebuilding reminders
  // for all habits/tasks/goals, a single GROUP query instead of N+1 —
  // entity_id -> that entity's reminders (ascending by time).
  mapByType(entityType: ReminderEntityType): Map<string, Reminder[]> {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM reminders WHERE entity_type = ? AND deleted_at IS NULL ORDER BY entity_id ASC, time ASC`,
      [entityType]
    );
    const map = new Map<string, Reminder[]>();
    for (const row of rows) {
      const r = rowToReminder(row);
      const list = map.get(r.entity_id);
      if (list) list.push(r);
      else map.set(r.entity_id, [r]);
    }
    return map;
  },

  create(entityType: ReminderEntityType, entityId: string, time: string): Reminder {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, NULL, 0)`,
      [id, entityType, entityId, time, now]
    );
    return { id, entity_type: entityType, entity_id: entityId, time, updated_at: now, deleted_at: null, synced: 0 };
  },

  deleteAllForEntity(entityType: ReminderEntityType, entityId: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE reminders SET deleted_at = ?, updated_at = ?, synced = 0
       WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL`,
      [now, now, entityType, entityId]
    );
  },

  // Replaces the existing records with the time list coming from the form
  // (old ones are deleted, new ones are created) — a reminder's own identity
  // doesn't matter, only its time.
  replaceAll(entityType: ReminderEntityType, entityId: string, times: string[]): Reminder[] {
    this.deleteAllForEntity(entityType, entityId);
    return [...times].sort().map((time) => this.create(entityType, entityId, time));
  },
};
