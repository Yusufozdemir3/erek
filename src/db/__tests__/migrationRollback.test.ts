// Migration transaction behavior: if a multi-statement migration fails partway,
// ALL of it must be rolled back and user_version must not advance. (Otherwise
// startup gets stuck with a half-applied schema + a "duplicate/already exists"
// error on the next attempt.)
//
// A deliberately broken list is injected in place of the real migration list;
// this file has its own module registry, so it doesn't affect other tests.

jest.mock('../migrations/001_initial', () => ({
  migrations: [
    { version: 1, sql: 'CREATE TABLE saglam (id TEXT PRIMARY KEY);' },
    {
      version: 2,
      // 1st statement succeeds, 2nd statement fails (duplicate table name).
      sql: 'CREATE TABLE yarim (id TEXT); CREATE TABLE yarim (id TEXT);',
    },
  ],
}));

import { getDb, runMigrations } from '../database';

function tableNames(): string[] {
  return getDb()
    .getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .map((r) => r.name);
}

function userVersion(): number {
  return getDb().getFirstSync<{ user_version: number }>('PRAGMA user_version;')!.user_version;
}

describe('yarıda kalan migration', () => {
  it('hata fırlatır, başarılı deyimleri geri alır ve user_version ilerletmez', async () => {
    await expect(runMigrations()).rejects.toThrow();

    // v1 completed, v2 fully rolled back.
    expect(userVersion()).toBe(1);
    expect(tableNames()).toContain('saglam');
    // Without a transaction, v2's first statement would have persisted.
    expect(tableNames()).not.toContain('yarim');
  });

  it('sonraki deneme temiz durumdan tekrar başlar', async () => {
    await expect(runMigrations()).rejects.toThrow();
    // No half-applied schema is left behind, so it retries with the same error —
    // it isn't dragged into a secondary error like "yarim already exists", and state stays clean.
    await expect(runMigrations()).rejects.toThrow(/already exists|exists/i);
    expect(userVersion()).toBe(1);
    expect(tableNames()).not.toContain('yarim');
  });
});
