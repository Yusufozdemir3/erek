// goalMilestoneRepo testleri: ekleme sırası (position), toggle, soft delete,
// sayım. subtaskRepo.test.ts ile birebir aynı desen (goal_id yerine task_id).

import { goalMilestoneRepo } from '../repositories/goalMilestoneRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let goalId: string;

beforeEach(async () => {
  await resetTestDb();
  const userId = userRepo.getOrCreateLocal().id;
  goalId = goalRepo.create({ user_id: userId, title: 'Ana hedef', goal_type: 'milestone' }).id;
});

describe('create / listByGoal', () => {
  it('eklenme sırasını korur (position artar)', () => {
    goalMilestoneRepo.create(goalId, 'Birinci');
    goalMilestoneRepo.create(goalId, 'İkinci');
    goalMilestoneRepo.create(goalId, 'Üçüncü');

    const list = goalMilestoneRepo.listByGoal(goalId);
    expect(list.map((m) => m.title)).toEqual(['Birinci', 'İkinci', 'Üçüncü']);
    expect(list.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  it('yeni adım synced=0 ve completed=0 başlar', () => {
    const m = goalMilestoneRepo.create(goalId, 'Yeni');
    expect(m.synced).toBe(0);
    expect(m.completed).toBe(0);
  });
});

describe('setCompleted', () => {
  it('işaretler, geri alır ve satırı yeniden senkron bekletir', () => {
    const m = goalMilestoneRepo.create(goalId, 'Madde');

    goalMilestoneRepo.setCompleted(m.id, true);
    expect(goalMilestoneRepo.listByGoal(goalId)[0].completed).toBe(1);

    goalMilestoneRepo.setCompleted(m.id, false);
    const after = goalMilestoneRepo.listByGoal(goalId)[0];
    expect(after.completed).toBe(0);
    expect(after.synced).toBe(0);
  });
});

describe('softDelete', () => {
  it('listeden düşürür ama satır durur; position boşluğu sorun değil', () => {
    const a = goalMilestoneRepo.create(goalId, 'A');
    goalMilestoneRepo.create(goalId, 'B');

    goalMilestoneRepo.softDelete(a.id);

    const list = goalMilestoneRepo.listByGoal(goalId);
    expect(list.map((m) => m.title)).toEqual(['B']);

    goalMilestoneRepo.create(goalId, 'C');
    expect(goalMilestoneRepo.listByGoal(goalId).map((m) => m.title)).toEqual(['B', 'C']);
  });
});

describe('countForGoal', () => {
  it('tamamlanan/toplam sayar, silinenleri saymaz', () => {
    expect(goalMilestoneRepo.countForGoal(goalId)).toEqual({ done: 0, total: 0 });

    const a = goalMilestoneRepo.create(goalId, 'A');
    const b = goalMilestoneRepo.create(goalId, 'B');
    goalMilestoneRepo.create(goalId, 'C');
    goalMilestoneRepo.setCompleted(a.id, true);

    expect(goalMilestoneRepo.countForGoal(goalId)).toEqual({ done: 1, total: 3 });

    goalMilestoneRepo.softDelete(b.id);
    expect(goalMilestoneRepo.countForGoal(goalId)).toEqual({ done: 1, total: 2 });
  });
});

describe('countsForGoals (çoklu)', () => {
  it('boş liste için boş nesne döner (geçersiz IN () sorgusu kurulmaz)', () => {
    expect(goalMilestoneRepo.countsForGoals([])).toEqual({});
  });

  it('yalnızca adımı olan hedefleri döner; countForGoal ile aynı sayar', () => {
    const userId = userRepo.getOrCreateLocal().id;
    const other = goalRepo.create({ user_id: userId, title: 'Diğer hedef', goal_type: 'milestone' }).id;
    const empty = goalRepo.create({ user_id: userId, title: 'Adımsız', goal_type: 'milestone' }).id;

    const a = goalMilestoneRepo.create(goalId, 'A');
    goalMilestoneRepo.create(goalId, 'B');
    goalMilestoneRepo.setCompleted(a.id, true);
    const c = goalMilestoneRepo.create(other, 'C');
    goalMilestoneRepo.setCompleted(c.id, true);

    const counts = goalMilestoneRepo.countsForGoals([goalId, other, empty]);
    expect(counts).toEqual({
      [goalId]: { done: 1, total: 2 },
      [other]: { done: 1, total: 1 },
    });
    expect(counts[empty]).toBeUndefined();
    expect(counts[goalId]).toEqual(goalMilestoneRepo.countForGoal(goalId));
  });

  it('silinen adımları saymaz', () => {
    const a = goalMilestoneRepo.create(goalId, 'A');
    goalMilestoneRepo.create(goalId, 'B');
    goalMilestoneRepo.softDelete(a.id);
    expect(goalMilestoneRepo.countsForGoals([goalId])).toEqual({ [goalId]: { done: 0, total: 1 } });
  });
});
