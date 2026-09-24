// goalMilestoneRepo tests: insertion order (position), toggle, soft delete,
// counting + intermediate-threshold (amount) derivation. Same base pattern as subtaskRepo.test.ts.

import { goalMilestoneRepo, milestoneViews } from '../repositories/goalMilestoneRepo';
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

describe('create — miktar + son tarih (ara-eşik alanları)', () => {
  it('amount ve due_date kaydedilip geri okunur; verilmezse null', () => {
    const withExtras = goalMilestoneRepo.create(goalId, 'Kitap A', {
      amount: 300,
      due_date: '2026-08-01',
    });
    expect(withExtras.amount).toBe(300);
    expect(withExtras.due_date).toBe('2026-08-01');

    const plain = goalMilestoneRepo.create(goalId, 'Sade');
    expect(plain.amount).toBeNull();
    expect(plain.due_date).toBeNull();

    const list = goalMilestoneRepo.listByGoal(goalId);
    expect(list[0].amount).toBe(300);
    expect(list[1].amount).toBeNull();
  });
});

describe('milestoneViews — ara-eşik türetme (saf fonksiyon)', () => {
  const ms = (title: string, amount: number | null, completed: 0 | 1 = 0) => ({
    id: title,
    goal_id: 'g',
    title,
    completed,
    position: 0,
    amount,
    due_date: null,
    updated_at: '',
    deleted_at: null,
    synced: 0 as const,
  });

  it('miktarlı adımlar KENDİ BAĞIMSIZ hedefine göre dolar (sıfırdan, birbirinin payını paylaşmaz)', () => {
    // Running example: "first 5km", "first 20km", "first 50km" — all three read from the same current_value.
    const views = milestoneViews([ms('5km', 5), ms('20km', 20), ms('50km', 50)], 8);
    expect(views[0].reached).toBe(true);  // 8 >= 5
    expect(views[0].ratio).toBe(1);
    expect(views[1].reached).toBe(false); // 8 < 20
    expect(views[1].ratio).toBeCloseTo(8 / 20);
    expect(views[2].reached).toBe(false); // 8 < 50
    expect(views[2].ratio).toBeCloseTo(8 / 50);
  });

  it('current 0 iken hepsi boş, her adımın kendi hedefinde o adım dolu', () => {
    const list = [ms('A', 300), ms('B', 400)];
    expect(milestoneViews(list, 0).every((v) => !v.reached && v.ratio === 0)).toBe(true);
    const views = milestoneViews(list, 300);
    expect(views[0].reached).toBe(true);
    expect(views[0].ratio).toBe(1);
    expect(views[1].reached).toBe(false);
    expect(views[1].ratio).toBeCloseTo(300 / 400);
  });

  it('miktarsız (checklist) adım completed kolonundan okunur, miktarlı adımları etkilemez', () => {
    const views = milestoneViews([ms('A', 300), ms('Not', null, 1), ms('B', 200)], 250);
    expect(views[1].reached).toBe(true); // completed=1
    expect(views[1].ratio).toBe(1);
    expect(views[0].ratio).toBeCloseTo(250 / 300);
    expect(views[2].reached).toBe(true); // 250 >= 200, B fills independently against its own target
    expect(views[2].ratio).toBe(1);
  });
});
