// Database setup: opens the connection, applies migrations in order.
// UI never uses this file directly — it uses the repository layer.

import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations/001_initial';

let dbInstance: SQLite.SQLiteDatabase | null = null;

// Returns a single connection instance (singleton).
export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('habitapp.db');
    // Enable foreign key constraints (off by default in SQLite)
    dbInstance.execSync('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

// Called once at app startup.
// Tracks which migrations have been applied in the user_version pragma.
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const result = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      // Migration + version stamp in a single transaction: if a multi-statement
      // migration fails partway through, the whole thing rolls back and is
      // retried from scratch on the next launch. (Otherwise a half-applied
      // schema plus a retry could permanently lock startup with a "duplicate column" error.)
      db.execSync('BEGIN;');
      try {
        db.execSync(migration.sql);
        db.execSync(`PRAGMA user_version = ${migration.version};`);
        db.execSync('COMMIT;');
      } catch (e) {
        // Some errors close the transaction on their own; ROLLBACK's own error
        // is swallowed so it doesn't shadow the original migration error.
        try {
          db.execSync('ROLLBACK;');
        } catch {}
        throw e;
      }
    }
  }
}
