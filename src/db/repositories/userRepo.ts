// User repository.
// The foundation of the "start without signing in" flow: an anonymous local
// user is created the first time the app opens. If the user later signs up,
// this record gets linked to their email (is_anonymous -> 0).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { User } from '../../types/models';

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    is_anonymous: row.is_anonymous,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const userRepo = {
  // Returns the device's existing user; creates an anonymous one if there isn't one.
  // Called at app startup - always guarantees a user.
  getOrCreateLocal(): User {
    const db = getDb();
    const existing = db.getFirstSync<any>(
      `SELECT * FROM users WHERE deleted_at IS NULL LIMIT 1`
    );
    if (existing) return rowToUser(existing);

    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO users (id, email, is_anonymous, updated_at, deleted_at, synced)
       VALUES (?, NULL, 1, ?, NULL, 0)`,
      [id, now]
    );
    // No need to query the newly-inserted row again — we already have the fields.
    return { id, email: null, is_anonymous: 1, updated_at: now, deleted_at: null, synced: 0 };
  },

  // Upgrades the anonymous user to a registered account (when an account gets linked from Settings).
  upgradeToAccount(id: string, email: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = ?, is_anonymous = 0, updated_at = ?, synced = 0 WHERE id = ?`,
      [email, nowIso(), id]
    );
  },

  // On sign-out, turns the local user back to anonymous (data stays on the device).
  downgradeToLocal(id: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = NULL, is_anonymous = 1, updated_at = ?, synced = 0 WHERE id = ?`,
      [nowIso(), id]
    );
  },
};
