// Reminder repository — a habit/task/goal can have ZERO OR MORE reminder
// times (see models.Reminder). UI never sees SQL.
// replaceAll: syncs the existing records to the "HH:MM" list coming from the
// form (the form submits its WHOLE list at once instead of adding/removing
// one by one like subtask/milestone; see HabitForm/TaskForm/GoalForm).

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

  // Brings back the reminders a deletion of the ENTITY took with it: only those
  // deleted at or after `since` (the entity's own deleted_at) — a reminder the
  // user had removed earlier stays removed. Used by the undo of a deletion.
  restoreForEntity(entityType: ReminderEntityType, entityId: string, since: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE reminders SET deleted_at = NULL, updated_at = ?, synced = 0
       WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?`,
      [now, entityType, entityId, since]
    );
  },

  // Makes the entity's active reminders match the time list coming from the
  // form. DIFF-BASED: a time that stays keeps its row (and id) untouched; only
  // removed times are deleted and only new times are created.
  // It used to delete everything and re-create the whole list on EVERY save —
  // even when the user never touched the reminders. That churned a tombstone +
  // a new row per time on each edit, and the delete/re-create pair (same time,
  // same millisecond, different id) is exactly what made the other device drop
  // the reminder during sync (see syncEngine.applyRemoteRow).
  replaceAll(entityType: ReminderEntityType, entityId: string, times: string[]): Reminder[] {
    const db = getDb();
    const wanted = new Set(times);
    const existing = this.listByEntity(entityType, entityId);
    const kept = new Set<string>();
    const now = nowIso();
    for (const r of existing) {
      if (wanted.has(r.time) && !kept.has(r.time)) {
        kept.add(r.time);
      } else {
        // Removed from the form (or a duplicate of a time already kept).
        db.runSync(
          `UPDATE reminders SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
          [now, now, r.id]
        );
      }
    }
    for (const time of wanted) {
      if (!kept.has(time)) this.create(entityType, entityId, time);
    }
    return [...this.listByEntity(entityType, entityId)];
  },
};
