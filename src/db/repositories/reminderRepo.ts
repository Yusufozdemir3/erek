// Reminders: any number of "HH:MM" times per habit/task/goal (models.Reminder).
// Forms submit their whole list at once (replaceAll).

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
  // Ascending by time.
  listByEntity(entityType: ReminderEntityType, entityId: string): Reminder[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM reminders WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL ORDER BY time ASC`,
      [entityType, entityId]
    );
    return rows.map(rowToReminder);
  },

  // listByEntity for every entity of a type in one query (startup rescheduling).
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

  // Undo of an entity's deletion: brings back the reminders deleted with it
  // (at or after `since`); ones removed earlier stay removed.
  restoreForEntity(entityType: ReminderEntityType, entityId: string, since: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE reminders SET deleted_at = NULL, updated_at = ?, synced = 0
       WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NOT NULL AND deleted_at >= ?`,
      [now, entityType, entityId, since]
    );
  },

  // Matches the active rows to the form's times by diff: a kept time keeps its
  // row and id. Deleting and recreating everything churned tombstones and could
  // make another device drop the reminder (syncEngine.applyRemoteRow).
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
