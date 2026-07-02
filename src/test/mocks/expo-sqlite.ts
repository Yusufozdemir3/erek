// Testlerde expo-sqlite yerine geçer (jest.config.js moduleNameMapper).
// Aynı senkron API'yi Node'un yerleşik sqlite modülüyle (in-memory) sağlar.
// Böylece repository testleri native modül olmadan GERÇEK SQL davranışıyla
// çalışır: UNIQUE kısıtları, foreign key'ler ve transaction'lar dahil.

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

  // Test yardımcısı: içteki DB'yi taze in-memory örnekle değiştirir.
  // Sarmalayıcı nesnenin kimliği korunur — database.ts'teki singleton geçerli kalır.
  // (node:sqlite'ta foreign key'ler varsayılan açık; PRAGMA tekrarına gerek yok.)
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

// Test yardımcısı — gerçek expo-sqlite API'sinde yoktur.
// Her testin temiz bir veritabanıyla başlaması için beforeEach'te çağrılır.
export function __resetAllDatabases(): void {
  for (const db of instances.values()) db.__reset();
}
