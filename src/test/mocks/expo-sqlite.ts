// Replaces expo-sqlite in tests (jest.config.js moduleNameMapper).
// Provides the same synchronous API using Node's built-in sqlite module
// (in-memory). This lets repository tests run with REAL SQL behavior, no
// native module needed: UNIQUE constraints, foreign keys, and transactions included.

import { DatabaseSync } from 'node:sqlite';

type BindParams = ReadonlyArray<string | number | bigint | null | Uint8Array>;

class FakeSQLiteDatabase {
  private db = new DatabaseSync(':memory:');

  execSync(sql: string): void {
    this.db.exec(sql);
  }

  runSync(sql: string, params: BindParams = []): void {
    this.db.prepare(sql).run(...params);
  }

  getFirstSync<T>(sql: string, params: BindParams = []): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  getAllSync<T>(sql: string, params: BindParams = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  // Test helper: replaces the inner DB with a fresh in-memory instance.
  // The wrapper object's identity is preserved — the singleton in database.ts stays valid.
  // (In node:sqlite, foreign keys are on by default; no need to repeat the PRAGMA.)
  __reset(): void {
    this.db.close();
    this.db = new DatabaseSync(':memory:');
  }
}

const instances = new Map<string, FakeSQLiteDatabase>();

export function openDatabaseSync(name: string): FakeSQLiteDatabase {
  let db = instances.get(name);
  if (!db) {
    db = new FakeSQLiteDatabase();
    instances.set(name, db);
  }
  return db;
}

// Test helper — doesn't exist in the real expo-sqlite API.
// Called in beforeEach so every test starts with a clean database.
export function __resetAllDatabases(): void {
  for (const db of instances.values()) db.__reset();
}
