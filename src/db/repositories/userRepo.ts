// The device's local user, created anonymous on first launch so the app works
// without an account; signing in stamps the email on it (is_anonymous -> 0).

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
  // Always returns a user, creating the anonymous one if needed.
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
    return { id, email: null, is_anonymous: 1, updated_at: now, deleted_at: null, synced: 0 };
  },

  // After signing in.
  upgradeToAccount(id: string, email: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = ?, is_anonymous = 0, updated_at = ?, synced = 0 WHERE id = ?`,
      [email, nowIso(), id]
    );
  },

  // After signing out or deleting the account.
  downgradeToLocal(id: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = NULL, is_anonymous = 1, updated_at = ?, synced = 0 WHERE id = ?`,
      [nowIso(), id]
    );
  },
};
