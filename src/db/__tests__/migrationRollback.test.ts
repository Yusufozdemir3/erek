// A migration failing halfway must roll back entirely without advancing
// user_version (a half-applied schema fails its retry forever). A broken list
// replaces the real one; this file has its own module registry.

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
    // The retry fails the same way, not on a leftover half-applied table.
    await expect(runMigrations()).rejects.toThrow(/already exists|exists/i);
    expect(userVersion()).toBe(1);
    expect(tableNames()).not.toContain('yarim');
  });
});
