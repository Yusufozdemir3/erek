// migration019: goal progress is now DERIVED (current_value =
// value_baseline + the sum of active entries).
//
// This migration's one critical promise is BACKWARD COMPATIBILITY: it must not
// change any goal's VISIBLE value, only split the same number into two parts
// that can be merged without conflict from now on. A wrong backfill would
// silently shift every live user's progress — hence the migration itself is tested.
//
// Setup: the migration list is applied by hand up to (but not including) 19,
// "old world" data is written, then only 019 is run. This way the actual
// production SQL is tested (not a copy of it).

import { getDb } from '../database';
import { migrations } from '../migrations/001_initial';
import { __resetAllDatabases } from '../../test/mocks/expo-sqlite';

const V = 19;

function applyUpTo(exclusiveVersion: number): void {
  const db = getDb();
  for (const m of migrations.filter((x) => x.version < exclusiveVersion)) db.execSync(m.sql);
}

function applyV19(): void {
  getDb().execSync(migrations.find((m) => m.version === V)!.sql);
}

// goals.user_id -> users(id) has an FK; the owner must be inserted before any goals.
function insertUser(): void {
  getDb().runSync(
    `INSERT INTO users (id, email, is_anonymous, updated_at, deleted_at, synced)
     VALUES ('u1', NULL, 1, '2026-07-01T00:00:00.000Z', NULL, 1)`
  );
}

function insertGoal(id: string, currentValue: number): void {
  getDb().runSync(
    `INSERT INTO goals (id, user_id, title, goal_type, target_value, current_value, unit,
                        deadline, remind_at, start_date, updated_at, deleted_at, synced)
     VALUES (?, 'u1', 'Hedef', 'numeric', 100, ?, 'km', NULL, NULL, NULL, '2026-07-01T00:00:00.000Z', NULL, 1)`,
    [id, currentValue]
  );
}

function insertEntry(goalId: string, amount: number, deleted = false): void {
  getDb().runSync(
    `INSERT INTO goal_entries (id, goal_id, amount, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, '2026-07-01T00:00:00.000Z', ?, 1)`,
    [`e-${goalId}-${amount}-${deleted}`, goalId, amount, deleted ? '2026-07-02T00:00:00.000Z' : null]
  );
}

function goalRow(id: string): { current_value: number; value_baseline: number; synced: number } {
  return getDb().getFirstSync<{ current_value: number; value_baseline: number; synced: number }>(
    `SELECT current_value, value_baseline, synced FROM goals WHERE id = ?`,
    [id]
  )!;
}

beforeEach(() => {
  __resetAllDatabases();
  applyUpTo(V);
  insertUser();
});

describe('migration019 — ilerlemenin baseline + girdiler olarak ayrıştırılması', () => {
  it('GÖRÜNEN DEĞERİ DEĞİŞTİRMEZ: girdisi olmayan eski hedefte değerin tamamı baseline olur', () => {
    insertGoal('g1', 40);

    applyV19();

    // 40 = 40 (baseline) + 0 (no entries) → the user sees no difference at all.
    expect(goalRow('g1').current_value).toBe(40);
    expect(goalRow('g1').value_baseline).toBe(40);
  });

  it('girdileri olan hedefte baseline yalnız girdilerle AÇIKLANAMAYAN farkı taşır', () => {
    // Of the 40, 15 comes from entries (e.g. linked habit contributions), and
    // 25 comes from a manual correction or from older versions that kept no entry record.
    insertGoal('g1', 40);
    insertEntry('g1', 10);
    insertEntry('g1', 5);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(25);
    expect(goalRow('g1').current_value).toBe(40); // unchanged
  });

  it('tamamı girdilerden gelen hedefte baseline 0 olur', () => {
    insertGoal('g1', 15);
    insertEntry('g1', 10);
    insertEntry('g1', 5);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(0);
    expect(goalRow('g1').current_value).toBe(15);
  });

  it('SİLİNMİŞ girdiler toplama katılmaz (yeniden hesapla aynı kural)', () => {
    // If a deleted entry counted, the baseline would be computed short and the
    // user's value would drop on the next recompute.
    insertGoal('g1', 30);
    insertEntry('g1', 10);
    insertEntry('g1', 99, true); // soft-deleted

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(20);
    expect(goalRow('g1').current_value).toBe(30);
  });

  it('negatif düzeltme girdileri de doğru hesaba katılır', () => {
    insertGoal('g1', 8);
    insertEntry('g1', 10);
    insertEntry('g1', -2);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(0);
    expect(goalRow('g1').current_value).toBe(8);
  });

  it('yeni kolonun buluta çıkması için hedefler yeniden gönderilmeyi bekler', () => {
    insertGoal('g1', 40); // inserted with synced=1

    applyV19();

    expect(goalRow('g1').synced).toBe(0);
  });

  it('hiç hedef yokken sorunsuz çalışır', () => {
    expect(() => applyV19()).not.toThrow();
  });
});
