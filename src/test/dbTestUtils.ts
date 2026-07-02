// DB'ye dokunan testler için ortak kurulum: her test temiz bir in-memory
// veritabanı + güncel şema (gerçek migration'lar) ile başlar.

import { __resetAllDatabases } from './mocks/expo-sqlite';
import { runMigrations } from '../db/database';

export async function resetTestDb(): Promise<void> {
  __resetAllDatabases();
  await runMigrations();
}
