// goalEntryRepo tests: entry history is only a LOG — it NEVER mutates
// goals.current_value (see the file-header comment there), it just keeps a
// record of "how much was added when". Same pattern as subtaskRepo/goalMilestoneRepo.

import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

// updated_at has millisecond resolution; if two consecutive creates land in
// the same millisecond, listByGoal's ORDER BY updated_at DESC (having no
// secondary sort key) doesn't guarantee "newest first". Scenarios that test
// ordering use a short wait to force a real time gap.
const tick = () => new Promise((r) => setTimeout(r, 20));

let goalId: string;

beforeEach(async () => {
  await resetTestDb();
  const userId = userRepo.getOrCreateLocal().id;
  goalId = goalRepo.create({ user_id: userId, title: 'Kitap oku', goal_type: 'numeric', target_value: 100 }).id;
});

describe('create / listByGoal', () => {
  it('en yeniden en eskiye sıralı döner', async () => {
    const first = goalEntryRepo.create(goalId, 5);
    await tick();
    const second = goalEntryRepo.create(goalId, 10);

    const list = goalEntryRepo.listByGoal(goalId);
    expect(list.map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it('negatif miktar (düzeltme) da kaydedilebilir', () => {
    goalEntryRepo.create(goalId, -3);
    expect(goalEntryRepo.listByGoal(goalId)[0].amount).toBe(-3);
  });

  it('yeni girdi synced=0 başlar, deleted_at null', () => {
    const e = goalEntryRepo.create(goalId, 7);
    expect(e.synced).toBe(0);
    expect(e.deleted_at).toBeNull();
  });

  it('goals.current_value\'yu ETKİLEMEZ — tek doğru kaynak yine goalRepo.addProgress', () => {
    const before = goalRepo.getById(goalId)!.current_value;
    goalEntryRepo.create(goalId, 40);
    const after = goalRepo.getById(goalId)!.current_value;
    expect(after).toBe(before); // unchanged from 0
  });

  it('farklı hedeflerin girdilerini karıştırmaz', () => {
    const other = goalRepo.create({ user_id: userRepo.getOrCreateLocal().id, title: 'Diğer', goal_type: 'numeric' }).id;
    goalEntryRepo.create(goalId, 5);
    goalEntryRepo.create(other, 9);

    expect(goalEntryRepo.listByGoal(goalId).map((e) => e.amount)).toEqual([5]);
    expect(goalEntryRepo.listByGoal(other).map((e) => e.amount)).toEqual([9]);
  });

  it('hiç girdisi olmayan hedefte boş liste döner', () => {
    expect(goalEntryRepo.listByGoal(goalId)).toEqual([]);
  });
});

describe('goalRepo.addProgress ile entegrasyon', () => {
  it('addProgress her çağrıda GERÇEKLEŞEN farkı (0 tabanı sonrası) girdi olarak yazar', async () => {
    goalRepo.addProgress(goalId, 95); // 0 -> 95
    await tick();
    goalRepo.addProgress(goalId, -120); // 95 - 120 = -25 -> clamped to 0, actual delta -95

    const entries = goalEntryRepo.listByGoal(goalId);
    expect(entries.map((e) => e.amount)).toEqual([-95, 95]); // newest to oldest
    expect(goalRepo.getById(goalId)!.current_value).toBe(0);
  });

  it('hedef dolu olsa bile ekleme UYGULANIR ve girdi yazılır (tavan yok)', async () => {
    goalRepo.addProgress(goalId, 100); // fill the goal
    await tick();
    const beforeCount = goalEntryRepo.listByGoal(goalId).length;

    // The target is a THRESHOLD, not a CAP: overshooting it is still recorded.
    expect(goalRepo.addProgress(goalId, 10)).toBe(10);

    expect(goalEntryRepo.listByGoal(goalId).length).toBe(beforeCount + 1);
    expect(goalRepo.getById(goalId)!.current_value).toBe(110);
  });

  it('gerçek fark 0 ise hiç girdi yazılmaz', () => {
    goalRepo.addProgress(goalId, 100);
    const beforeCount = goalEntryRepo.listByGoal(goalId).length;

    goalRepo.addProgress(goalId, 0); // nothing changes

    expect(goalEntryRepo.listByGoal(goalId).length).toBe(beforeCount);
  });
});
