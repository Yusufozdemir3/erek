// Migration sistemi testleri: tam şema kurulumu, sürüm damgası, idempotentlik
// ve şemanın kritik kısıtları (UNIQUE, FK).

import { getDb, runMigrations } from '../database';
import { migrations } from '../migrations/001_initial';
import { resetTestDb } from '../../test/dbTestUtils';

beforeEach(async () => {
  await resetTestDb();
});

describe('runMigrations', () => {
  it('user_version en son migration sürümüne gelir', () => {
    const row = getDb().getFirstSync<{ user_version: number }>('PRAGMA user_version;');
    expect(row?.user_version).toBe(migrations[migrations.length - 1].version);
  });

  it('tüm tablolar oluşur', () => {
    const rows = getDb().getAllSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table'`
    );
    const names = rows.map((r) => r.name);
    for (const table of ['users', 'tasks', 'goals', 'habits', 'habit_logs']) {
      expect(names).toContain(table);
    }
  });

  it('ikinci kez çalıştırmak hata vermez (idempotent)', async () => {
    await expect(runMigrations()).resolves.toBeUndefined();
  });
});

describe('şema kısıtları', () => {
  it('habit_logs aynı gün için ikinci kaydı reddeder (UNIQUE)', () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.runSync(
      `INSERT INTO users (id, updated_at) VALUES ('u1', ?)`,
      [now]
    );
    db.runSync(
      `INSERT INTO habits (id, user_id, title, updated_at) VALUES ('h1', 'u1', 'Su iç', ?)`,
      [now]
    );
    db.runSync(
      `INSERT INTO habit_logs (id, habit_id, log_date, completed, updated_at) VALUES ('l1', 'h1', '2026-07-01', 1, ?)`,
      [now]
    );
    expect(() =>
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, updated_at) VALUES ('l2', 'h1', '2026-07-01', 1, ?)`,
        [now]
      )
    ).toThrow();
  });

  it('habit_logs var olmayan alışkanlığa kayıt reddeder (FK)', () => {
    const db = getDb();
    expect(() =>
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, updated_at) VALUES ('l1', 'yok', '2026-07-01', 1, ?)`,
        [new Date().toISOString()]
      )
    ).toThrow();
  });
});
