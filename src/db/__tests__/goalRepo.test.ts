// goalRepo tests: CRUD, numeric progress (addProgress) clamping,
// current_value clamp in update, progressRatio, the counter logic being
// silently ignored for milestone goals, and isCompleted/setCompleted.

import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { TIME_UNIT } from '../../lib/helpers';
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
    // The row read right after create has synced=0; we'd set it to 1 to fake being synced.
    // (This is just to observe that update pulls synced back to 0.)
    goalRepo.update(goal.id, { title: '200 km koş', target_value: 200, unit: 'mil' });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.title).toBe('200 km koş');
    expect(fromDb.target_value).toBe(200);
    expect(fromDb.unit).toBe('mil');
    expect(fromDb.synced).toBe(0);
  });

  it('current_value negatif verilirse 0\'a sıkışır (tek sınır budur)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { current_value: -5 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('current_value hedefi AŞABİLİR (hedef sınır değil eşiktir)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { current_value: 500 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(500);
  });

  it('hedefi düşürmek birikmiş ilerlemeyi KESMEZ', () => {
    // The clamp here used to pull 80 down to 50: the work the user had
    // actually done was silently wiped out just because they lowered their target.
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { target_value: 50, current_value: 80 });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.target_value).toBe(50);
    expect(fromDb.current_value).toBe(80);
  });

  it('hiç alan verilmezse hiçbir şey yapmaz', () => {
    const goal = numericGoal();
    goalRepo.update(goal.id, {});
    expect(goalRepo.getById(goal.id)).toEqual(goal);
  });
});

// addProgress now also writes the entry history (previously every caller had
// to separately call goalEntryRepo.create, and habit contributions got missed).
// The record must capture the ACTUAL delta applied, not the REQUESTED one — otherwise
// history contradicts current_value and the tempo/projection computed from it inflates.
describe('addProgress girdi geçmişi', () => {
  it('uygulanan farkı girdi olarak yazar ve döndürür', () => {
    const goal = numericGoal({ target_value: 100 });
    expect(goalRepo.addProgress(goal.id, 40)).toBe(40);
    const entries = goalEntryRepo.listByGoal(goal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(40);
  });

  it('0 tabanında kırpılınca girdiye istenen değil GERÇEKLEŞEN fark yazılır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    // 10 - 30 = -20 but the floor is 0 → only -10 is actually applied.
    expect(goalRepo.addProgress(goal.id, -30)).toBe(-10);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
    const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
    expect(amounts).toContain(-10);
    expect(amounts).not.toContain(-30);
  });

  it('negatif ilerleme (geri alma) negatif girdi yazar', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.addProgress(goal.id, -4)).toBe(-4);
    expect(goalEntryRepo.listByGoal(goal.id).map((e) => e.amount)).toContain(-4);
  });

  it('hiçbir şey değişmezse girdi yazmaz', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 0); // no change
    expect(goalEntryRepo.listByGoal(goal.id)).toEqual([]);
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.addProgress(goal.id, -30)).toBe(-10); // settled at the 0 floor
    expect(goalRepo.addProgress(goal.id, -5)).toBe(0); // already 0, unchanged
    expect(goalEntryRepo.listByGoal(goal.id)).toHaveLength(2);
  });

  it('sayısal olmayan hedefte girdi yazmaz', () => {
    const goal = goalRepo.create({
      user_id: userId,
      title: 'Adımlı hedef',
      goal_type: 'milestone',
    });
    expect(goalRepo.addProgress(goal.id, 5)).toBe(0);
    expect(goalEntryRepo.listByGoal(goal.id)).toEqual([]);
  });
});

// current_value is now a DERIVED cache: value_baseline + the sum of active
// entries (see migration019). If this invariant breaks, sync's post-pull
// recompute shifts the user's value — hence it's tested separately.
describe('current_value değişmezi (baseline + girdiler)', () => {
  const invariant = (goalId: string) => {
    const goal = goalRepo.getById(goalId)!;
    const sum = goalEntryRepo.listByGoal(goalId).reduce((s, e) => s + e.amount, 0);
    expect(goal.current_value).toBe(Math.max(0, goal.value_baseline + sum));
  };

  it('yeni hedefte baseline 0, değer 0', () => {
    const goal = numericGoal();
    expect(goal.value_baseline).toBe(0);
    invariant(goal.id);
  });

  it('addProgress girdiyi yazar, baseline\'a DOKUNMAZ', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(40);
    expect(after.value_baseline).toBe(0); // the contribution lives in entries, not baseline
    invariant(goal.id);
  });

  it('"Mevcut değer"i ELLE değiştirmek baseline\'ı yazar, girdi geçmişine dokunmaz', () => {
    // A manual correction isn't a day's work; it shouldn't inflate tempo (which is
    // why no entry is written). But the value still needs to be written somewhere
    // so it survives recompute — that place is the baseline.
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    const entriesBefore = goalEntryRepo.listByGoal(goal.id).length;

    goalRepo.update(goal.id, { current_value: 100 });

    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(100);
    expect(after.value_baseline).toBe(60); // 100 = 60 + 40 (entry)
    expect(goalEntryRepo.listByGoal(goal.id).length).toBe(entriesBefore);
    invariant(goal.id);
  });

  it('elle düzeltmeden SONRAKİ ilerleme düzeltmenin üstüne biner', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { current_value: 100 }); // baseline 60
    goalRepo.addProgress(goal.id, 5);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(105);
    invariant(goal.id);
  });

  it('negatif düzeltme girdisi toplamdan düşer', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.addProgress(goal.id, -15);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(25);
    invariant(goal.id);
  });

  it('yalnız başlık güncellemek değeri ve baseline\'ı bozmaz', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { title: 'Yeni ad' });
    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(40);
    expect(after.value_baseline).toBe(0);
  });

  it('recomputeAllFromEntries değeri değiştirmez (zaten tutarlıysa)', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { current_value: 100 });
    goalRepo.recomputeAllFromEntries();
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
  });

  // When "also add to progress history" is checked, the delta is written to the
  // ENTRY, not the BASELINE. Doing both would make the total diverge from
  // current_value, and the value would jump on the next recompute with the user
  // doing nothing (this was exactly the bug the screen used to have — see the goalRepo.update comment).
  describe('log_manual_change', () => {
    it('işaretliyken fark girdi olarak yazılır, baseline sabit kalır', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);

      goalRepo.update(goal.id, { current_value: 100, log_manual_change: true });

      const after = goalRepo.getById(goal.id)!;
      expect(after.current_value).toBe(100);
      expect(after.value_baseline).toBe(0); // baseline was NOT touched
      const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
      expect(amounts).toContain(60); // the delta landed in history
      invariant(goal.id);
    });

    it('DEĞER SIÇRAMAZ: yeniden hesap sonrası da aynı kalır', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      goalRepo.update(goal.id, { current_value: 100, log_manual_change: true });

      goalRepo.recomputeAllFromEntries();

      expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
    });

    it('işaretli DEĞİLKEN geçmişe hiçbir şey yazılmaz', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      const before = goalEntryRepo.listByGoal(goal.id).length;

      goalRepo.update(goal.id, { current_value: 100 });

      expect(goalRepo.listByUser(userId)[0].current_value).toBe(100);
      expect(goalEntryRepo.listByGoal(goal.id).length).toBe(before);
    });

    it('değer değişmemişse boş girdi üretmez', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      const before = goalEntryRepo.listByGoal(goal.id).length;

      goalRepo.update(goal.id, { current_value: 40, log_manual_change: true });

      expect(goalEntryRepo.listByGoal(goal.id).length).toBe(before);
      invariant(goal.id);
    });
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

  it('hedefi AŞABİLİR — sayaç dürüsttür, tavan yok', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 130);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(130);
    // Display side still doesn't overflow: the ratio is clamped to 1.
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBe(1);
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

// A goal that's OVERSHOT its target (current_value > target_value) is a normal
// state: the timer doesn't STOP once it reaches the target, the user can keep
// working. addProgress's ceiling clamp used to produce a delta in the OPPOSITE
// of the requested direction on such a goal ("add +1" would pull current_value
// back down to the ceiling, wiping out all the excess, and drop a huge negative
// entry into history that never actually happened). The ceiling has been removed
// entirely — these tests lock in that this behavior never comes back.
describe('addProgress — hedefi aşmış hedef', () => {
  // Sets up a state where 100 minutes (6000s) were logged against a 1-hour (3600s) goal.
  const overshotGoal = () => {
    const goal = numericGoal({ target_value: 3600, unit: TIME_UNIT });
    goalRepo.addProgress(goal.id, 6000);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(6000);
    return goal;
  };

  it('pozitif ekleme tam uygulanır, ilerlemeyi DÜŞÜRMEZ', () => {
    const goal = overshotGoal();
    expect(goalRepo.addProgress(goal.id, 60)).toBe(60);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(6060);
  });

  it('pozitif eklemede girdi geçmişine negatif kayıt yazmaz', () => {
    const goal = overshotGoal();
    goalRepo.addProgress(goal.id, 60);
    const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
    expect(amounts.filter((a) => a < 0)).toEqual([]);
  });

  it('negatif düzeltme hedefi aşmış hedefte de tam uygulanır', () => {
    const goal = overshotGoal();
    expect(goalRepo.addProgress(goal.id, -60)).toBe(-60);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(5940);
  });

  // The net effect of a linked habit's "check → uncheck" cycle must be ZERO.
  // With the ceiling in place, +1 was swallowed while -1 was fully applied;
  // every cycle silently stole 1 unit from the goal (see habitRepo.bumpGoalIfLinked).
  it('hedef doluyken +1/-1 döngüsü simetriktir (net etki 0)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 100); // fully filled
    goalRepo.addProgress(goal.id, 1); // habit checked
    goalRepo.addProgress(goal.id, -1); // unchecked
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
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
