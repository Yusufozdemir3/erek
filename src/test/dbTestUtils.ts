// Shared setup for tests that touch the DB: every test starts with a clean
// in-memory database + the current schema (real migrations).

import { __resetAllDatabases } from './mocks/expo-sqlite';
import { runMigrations } from '../db/database';

export async function resetTestDb(): Promise<void> {
  __resetAllDatabases();
  await runMigrations();
}
