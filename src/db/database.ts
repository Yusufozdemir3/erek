// Veritabanı kurulumu: bağlantıyı açar, migration'ları sırayla uygular.
// UI bu dosyayı doğrudan kullanmaz - repository katmanı kullanır.

import * as SQLite from 'expo-sqlite';
import { migrations } from './migrations/001_initial';

let dbInstance: SQLite.SQLiteDatabase | null = null;

// Tek bir bağlantı örneği döner (singleton).
export function getDb(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync('habitapp.db');
    // Foreign key kısıtlamalarını aç (SQLite'ta varsayılan kapalı)
    dbInstance.execSync('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

// Uygulama açılışında bir kez çağrılır.
// Hangi migration'ların uygulandığını user_version pragma'sında tutar.
export async function runMigrations(): Promise<void> {
  const db = getDb();
  const result = db.getFirstSync<{ user_version: number }>(
    'PRAGMA user_version;'
  );
  const currentVersion = result?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.execSync(migration.sql);
      db.execSync(`PRAGMA user_version = ${migration.version};`);
    }
  }
}
