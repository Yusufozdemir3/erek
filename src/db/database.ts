// Opens the connection and applies migrations. The UI goes through the repositories.

import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations/001_initial';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('habitapp.db');
    // Off by default in SQLite.
    dbInstance.execSync('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

// Progress is tracked in PRAGMA user_version.
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const result = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      // Migration + version stamp in one transaction: a half-applied migration
      // would fail its retry ("duplicate column") on every launch.
      db.execSync('BEGIN;');
      try {
        db.execSync(migration.sql);
        db.execSync(`PRAGMA user_version = ${migration.version};`);
        db.execSync('COMMIT;');
      } catch (e) {
        // ROLLBACK may fail if the error already ended the transaction; keep the original error.
        try {
          db.execSync('ROLLBACK;');
        } catch {}
        throw e;
      }
    }
  }
}
