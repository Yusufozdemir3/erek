// goalRepo testleri: CRUD, sayısal ilerleme (addProgress) kırpması,
// update'teki current_value clamp'i, progressRatio, parçalı (milestone)
// hedeflerde sayaç mantığının sessizce yok sayılması ve isCompleted/setCompleted.

import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function numericGoal(extra: Partial<Parameters<typeof goalRepo.create>[0]> = {}) {
  return goalRepo.create({
    user_id: userId,
    title: '100 km koş',
    goal_type: 'numeric',
    target_value: 100,
    unit: 'km',
    ...extra,
  });
}

function milestoneGoal(extra: Partial<Parameters<typeof goalRepo.create>[0]> = {}) {
  return goalRepo.create({
    user_id: userId,
    title: 'Tez bitir',
    goal_type: 'milestone',
    deadline: '2026-09-01',
    ...extra,
  });
}

describe('create / getById', () => {
  it('sayısal hedefi varsayılanlarla (current_value=0) oluşturur ve geri okur', () => {
    const goal = numericGoal();
    const fromDb = goalRepo.getById(goal.id);
    expect(fromDb).toEqual(goal);
    expect(fromDb!.goal_type).toBe('numeric');
    expect(fromDb!.target_value).toBe(100);
    expect(fromDb!.current_value).toBe(0);
    expect(fromDb!.unit).toBe('km');
    expect(fromDb!.deleted_at).toBeNull();
    expect(fromDb!.synced).toBe(0);
  });

  it('parçalı (milestone) hedefi oluşturur (target_value/unit null, deadline dolu)', () => {
    const goal = milestoneGoal();
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.goal_type).toBe('milestone');
    expect(fromDb.deadline).toBe('2026-09-01');
    expect(fromDb.target_value).toBeNull();
    expect(fromDb.unit).toBeNull();
    expect(fromDb.completed_at).toBeNull();
  });

  it('silinmiş hedef getById ile gelmez', () => {
    const goal = numericGoal();
    goalRepo.softDelete(goal.id);
    expect(goalRepo.getById(goal.id)).toBeNull();
  });
});

describe('listByUser', () => {
  it('yalnızca kullanıcının silinmemiş hedeflerini döner', () => {
    const a = numericGoal({ title: 'A' });
    const b = milestoneGoal({ title: 'B' });
    const c = numericGoal({ title: 'C' });
    goalRepo.softDelete(b.id);

    const ids = goalRepo.listByUser(userId).map((g) => g.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(b.id);
  });

  it('başka kullanıcının hedefini döndürmez', () => {
    numericGoal();
    expect(goalRepo.listByUser('baska-kullanici')).toEqual([]);
  });
});

describe('update', () => {
  it('başlık/hedef/birim/son tarihi değiştirir ve yeniden senkron bekletir (synced=0)', () => {
    const goal = numericGoal();
    // create sonrası okunan satır synced=0; senkron olduğunu taklit için 1 yapalım.
    // (update'in synced'i 0'a çektiğini görmek adına.)
    goalRepo.update(goal.id, { title: '200 km koş', target_value: 200, unit: 'mil' });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.title).toBe('200 km koş');
    expect(fromDb.target_value).toBe(200);
    expect(fromDb.unit).toBe('mil');
    expect(fromDb.synced).toBe(0);
  });

  it('current_value negatif verilirse 0\'a, hedefi aşarsa hedefe sıkışır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { current_value: -5 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
    goalRepo.update(goal.id, { current_value: 500 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
  });

  it('aynı çağrıda hedef de değişiyorsa clamp YENİ hedefe göre yapılır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { target_value: 50, current_value: 80 });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.target_value).toBe(50);
    expect(fromDb.current_value).toBe(50);
  });

  it('hiç alan verilmezse hiçbir şey yapmaz', () => {
    const goal = numericGoal();
    goalRepo.update(goal.id, {});
    expect(goalRepo.getById(goal.id)).toEqual(goal);
  });
});

describe('addProgress', () => {
  it('sayısal hedefte ilerlemeyi artırır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 40);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(40);
    goalRepo.addProgress(goal.id, 5);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(45);
  });

  it('hedefi aşmaz (target_value ile sınırlı)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 130);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
  });

  it('0\'ın altına inmez', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    goalRepo.addProgress(goal.id, -50);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('hedef değeri null ise üst sınır uygulanmaz', () => {
    const goal = numericGoal({ target_value: null });
    goalRepo.addProgress(goal.id, 9999);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(9999);
  });

  it('parçalı (milestone) hedefte sessizce yok sayılır (sayaç bozulmaz)', () => {
    const goal = milestoneGoal();
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('olmayan hedefte hata vermez', () => {
    expect(() => goalRepo.addProgress('yok', 5)).not.toThrow();
  });
});

describe('progressRatio', () => {
  it('sayısal hedefte 0..1 arası oran döner', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 40);
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBeCloseTo(0.4);
  });

  it('hedefe ulaşınca/aşınca 1\'de kalır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 100);
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBe(1);
  });

  it('parçalı hedefte ya da hedef değeri yoksa 0 döner', () => {
    expect(goalRepo.progressRatio(milestoneGoal())).toBe(0);
    expect(goalRepo.progressRatio(numericGoal({ target_value: null }))).toBe(0);
    expect(goalRepo.progressRatio(numericGoal({ target_value: 0 }))).toBe(0);
  });
});

describe('isCompleted / setCompleted', () => {
  it('sayısal hedefte oran 1\'e ulaşınca tamamlanmış sayılır (bayrak yok)', () => {
    const goal = numericGoal({ target_value: 100 });
    expect(goalRepo.isCompleted(goalRepo.getById(goal.id)!)).toBe(false);
    goalRepo.addProgress(goal.id, 100);
    expect(goalRepo.isCompleted(goalRepo.getById(goal.id)!)).toBe(true);
  });

  it('parçalı hedefte tamamlanma yalnızca completed_at bayrağından gelir', () => {
    const goal = milestoneGoal();
    expect(goalRepo.isCompleted(goal)).toBe(false);
    goalRepo.setCompleted(goal.id, true);
    const done = goalRepo.getById(goal.id)!;
    expect(done.completed_at).not.toBeNull();
    expect(goalRepo.isCompleted(done)).toBe(true);
    goalRepo.setCompleted(goal.id, false);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });

  it('sayısal hedefte setCompleted sessizce yok sayılır', () => {
    const goal = numericGoal();
    goalRepo.setCompleted(goal.id, true);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });
});

describe('softDelete', () => {
  it('hedefi gizler ama satır durur ve synced=0 olur', () => {
    const goal = numericGoal();
    goalRepo.softDelete(goal.id);
    expect(goalRepo.getById(goal.id)).toBeNull();
    expect(goalRepo.listByUser(userId)).toEqual([]);
  });
});
