// userRepo tests: anonymous startup + account upgrade/downgrade flow.

import { getDb } from '../database';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

beforeEach(async () => {
  await resetTestDb();
});

describe('getOrCreateLocal', () => {
  it('ilk çağrıda anonim kullanıcı oluşturur', () => {
    const user = userRepo.getOrCreateLocal();
    expect(user.id).toBeTruthy();
    expect(user.email).toBeNull();
    expect(user.is_anonymous).toBe(1);
    expect(user.deleted_at).toBeNull();
    expect(user.synced).toBe(0);
  });

  it('ikinci çağrı aynı kullanıcıyı döner, yenisini oluşturmaz', () => {
    const first = userRepo.getOrCreateLocal();
    const second = userRepo.getOrCreateLocal();
    expect(second.id).toBe(first.id);

    const rows = getDb().getAllSync<{ id: string }>('SELECT id FROM users');
    expect(rows).toHaveLength(1);
  });

  it('oluşturduğu kullanıcı DB\'deki satırla birebir aynıdır', () => {
    const created = userRepo.getOrCreateLocal();
    const fromDb = userRepo.getOrCreateLocal();
    expect(fromDb).toEqual(created);
  });
});

describe('hesap yükseltme / düşürme', () => {
  it('upgradeToAccount e-postayı yazar ve senkron bekletir', () => {
    const user = userRepo.getOrCreateLocal();
    userRepo.upgradeToAccount(user.id, 'test@example.com');

    const updated = userRepo.getOrCreateLocal();
    expect(updated.email).toBe('test@example.com');
    expect(updated.is_anonymous).toBe(0);
    expect(updated.synced).toBe(0);
  });

  it('downgradeToLocal kullanıcıyı yeniden anonim yapar, veri satırı kalır', () => {
    const user = userRepo.getOrCreateLocal();
    userRepo.upgradeToAccount(user.id, 'test@example.com');
    userRepo.downgradeToLocal(user.id);

    const updated = userRepo.getOrCreateLocal();
    expect(updated.id).toBe(user.id);
    expect(updated.email).toBeNull();
    expect(updated.is_anonymous).toBe(1);
  });
});
