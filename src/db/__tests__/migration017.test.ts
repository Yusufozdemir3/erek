// migration017: dashless reminder ids from migration016 become canonical
// UUIDs (Postgres returns them dashed; a mismatch duplicated reminders).

import { getDb } from '../database';
import { migration017 } from '../migrations/001_initial';
import { resetTestDb } from '../../test/dbTestUtils';

const LEGACY_ID = 'a3f1b2c4d5e6f708192a3b4c5d6e7f80'; // 32 characters, dashless
const CANONICAL = 'a3f1b2c4-d5e6-f708-192a-3b4c5d6e7f80';

function insertReminder(id: string): void {
  getDb().runSync(
    `INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
     VALUES (?, 'habit', 'habit-1', '08:30', '2026-07-01T00:00:00.000Z', NULL, 1)`,
    [id]
  );
}

function rows(): Array<{ id: string; synced: number }> {
  return getDb().getAllSync<{ id: string; synced: number }>(
    `SELECT id, synced FROM reminders ORDER BY id`
  );
}

beforeEach(async () => {
  await resetTestDb();
  getDb().runSync(`DELETE FROM reminders`); // avoid interference from migration016's backfill
});

describe('migration017 — hatırlatma id normalizasyonu', () => {
  it('tiresiz 32 karakterlik id\'yi kanonik UUID yapar ve yeniden push için synced=0 işaretler', () => {
    insertReminder(LEGACY_ID);

    getDb().execSync(migration017);

    expect(rows()).toEqual([{ id: CANONICAL, synced: 0 }]);
  });

  it('zaten kanonik olan id\'ye dokunmaz (synced bozulmaz)', () => {
    insertReminder(CANONICAL);

    getDb().execSync(migration017);

    expect(rows()).toEqual([{ id: CANONICAL, synced: 1 }]);
  });

  it('idempotenttir: ikinci kez çalışınca id yeniden bölünmez', () => {
    insertReminder(LEGACY_ID);

    getDb().execSync(migration017);
    getDb().execSync(migration017);

    expect(rows().map((r) => r.id)).toEqual([CANONICAL]);
  });
});
