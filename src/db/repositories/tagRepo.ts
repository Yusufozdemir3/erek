// Task tags the user makes up ("Work", "Home"…). A task holds its tags as a
// JSON id list (tasks.tag_ids, see migration023), so deleting a tag only
// tombstones it here; tasks keep the id and every reader skips it.

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { Tag } from '../../types/models';

export const TAG_NAME_MAX_LEN = 24;

function rowToTag(row: any): Tag {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.color ?? null,
    position: row.position,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

// Trimmed, inner whitespace collapsed, length-capped; '' = not a usable name.
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, TAG_NAME_MAX_LEN).trim();
}

// Case-insensitive key for "same name?": I/İ/ı fold to i first, so "İş", "iş"
// and "IŞ" match whatever the device locale (toLowerCase alone splits them).
export function tagNameKey(name: string): string {
  return cleanTagName(name).replace(/[Iİı]/g, 'i').toLowerCase();
}

export const tagRepo = {
  // Creation order, so a new tag lands at the end of every chip row.
  listByUser(userId: string): Tag[] {
    return getDb()
      .getAllSync<any>(
        `SELECT * FROM tags WHERE user_id = ? AND deleted_at IS NULL ORDER BY position, name COLLATE NOCASE`,
        [userId]
      )
      .map(rowToTag);
  },

  getById(id: string): Tag | null {
    const row = getDb().getFirstSync<any>(`SELECT * FROM tags WHERE id = ? AND deleted_at IS NULL`, [id]);
    return row ? rowToTag(row) : null;
  },

  // A live tag with this name (case-insensitive), so "İş" isn't made twice.
  findByName(userId: string, name: string): Tag | null {
    const key = tagNameKey(name);
    if (!key) return null;
    return this.listByUser(userId).find((t) => tagNameKey(t.name) === key) ?? null;
  },

  // Returns the existing tag when the name is taken; null for an empty name.
  create(userId: string, name: string, color: string | null): Tag | null {
    const clean = cleanTagName(name);
    if (!clean) return null;
    const existing = this.findByName(userId, clean);
    if (existing) return existing;
    const db = getDb();
    const id = newId();
    const pos = db.getFirstSync<{ n: number | null }>(`SELECT MAX(position) AS n FROM tags WHERE user_id = ?`, [userId]);
    db.runSync(
      `INSERT INTO tags (id, user_id, name, color, position, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
      [id, userId, clean, color, (pos?.n ?? -1) + 1, nowIso()]
    );
    return this.getById(id);
  },

  // false when the name is empty or belongs to another tag (nothing changes).
  update(id: string, fields: { name?: string; color?: string | null }): boolean {
    const tag = this.getById(id);
    if (!tag) return false;
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.name !== undefined) {
      const clean = cleanTagName(fields.name);
      if (!clean) return false;
      const other = this.findByName(tag.user_id, clean);
      if (other && other.id !== id) return false;
      sets.push('name = ?');
      vals.push(clean);
    }
    if (fields.color !== undefined) {
      sets.push('color = ?');
      vals.push(fields.color);
    }
    if (sets.length === 0) return true;
    sets.push('updated_at = ?', 'synced = 0');
    vals.push(nowIso(), id);
    getDb().runSync(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, vals);
    return true;
  },

  softDelete(id: string): void {
    const now = nowIso();
    getDb().runSync(`UPDATE tags SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ? AND deleted_at IS NULL`, [
      now,
      now,
      id,
    ]);
  },

  // How many of the user's live tasks carry the tag (shown before deleting it).
  // Parsed in JS: one malformed tag_ids would make json_each fail the whole query.
  countTasks(userId: string, id: string): number {
    const rows = getDb().getAllSync<{ tag_ids: string }>(
      `SELECT tag_ids FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL AND shared_owner_uid IS NULL AND instr(tag_ids, ?) > 0`,
      [userId, id]
    );
    return rows.filter((r) => parseTagIds(r.tag_ids).includes(id)).length;
  },
};

// tasks.tag_ids → ids; anything malformed reads as no tags.
export function parseTagIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];
  } catch {
    return [];
  }
}

// ids → tasks.tag_ids; no tags = NULL.
export function tagIdsToJson(ids: readonly string[] | null | undefined): string | null {
  const clean = [...new Set((ids ?? []).filter((x) => typeof x === 'string' && x.length > 0))];
  return clean.length > 0 ? JSON.stringify(clean) : null;
}
