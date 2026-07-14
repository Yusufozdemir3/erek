// habitRepo testleri: CRUD, toggleLog/incrementAmount sınır durumları ve
// streak hesabı (günlük + haftalık plan).
//
// Tarih mantığı deterministik olsun diye sistem saati sabitlenir:
// "bugün" = 2026-07-01 (Çarşamba). Önceki günler: 30 Salı, 29 Pzt, 28 Paz,
// 27 Cmt, 26 Cum, 25 Per, 24 Çar, 23 Salı, 22 Pzt...

import { getDb } from '../database';
import { habitRepo } from '../repositories/habitRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

const TODAY = '2026-07-01'; // Çarşamba

let userId: string;

beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-07-01T12:00:00') });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function createHabit(extra: Partial<Parameters<typeof habitRepo.create>[0]> = {}) {
  return habitRepo.create({ user_id: userId, title: 'Su iç', ...extra });
}

describe('create / getById', () => {
  it('varsayılanlarla oluşturur ve geri okur', () => {
    const habit = createHabit();
    const fromDb = habitRepo.getById(habit.id);
    expect(fromDb).toEqual(habit);
    expect(fromDb!.schedule).toBeNull();
    expect(fromDb!.target_amount).toBeNull();
    expect(fromDb!.deleted_at).toBeNull();
    expect(fromDb!.synced).toBe(0);
  });

  it('schedule JSON olarak gidip nesne olarak geri gelir', () => {
    const habit = createHabit({ schedule: { freq: 'weekly', weekdays: [1, 3, 5] } });
    expect(habitRepo.getById(habit.id)!.schedule).toEqual({
      freq: 'weekly',
      weekdays: [1, 3, 5],
    });
  });
});

describe('update / softDelete', () => {
  it('update alanı değiştirir ve satırı yeniden senkron bekletir (synced=0)', () => {
    const habit = createHabit();
    // Senkronlanmış gibi işaretle ki update'in synced=0 yaptığı görülsün.
    getDb().runSync(`UPDATE habits SET synced = 1 WHERE id = ?`, [habit.id]);

    habitRepo.update(habit.id, { title: 'Su iç (2L)', target_amount: 8, unit: 'bardak' });

    const updated = habitRepo.getById(habit.id)!;
    expect(updated.title).toBe('Su iç (2L)');
    expect(updated.target_amount).toBe(8);
    expect(updated.unit).toBe('bardak');
    expect(updated.synced).toBe(0);
  });

  it('softDelete kaydı gizler ama satır durur', () => {
    const habit = createHabit();
    habitRepo.softDelete(habit.id);

    expect(habitRepo.getById(habit.id)).toBeNull();
    expect(habitRepo.listByUser(userId)).toHaveLength(0);

    const row = getDb().getFirstSync<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM habits WHERE id = ?`,
      [habit.id]
    );
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe('toggleLog / isCompletedOn', () => {
  it('işaretler, geri alır ve aynı gün için tek satır tutar', () => {
    const habit = createHabit();

    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(true);

    habitRepo.toggleLog(habit.id, TODAY, false);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);

    const rows = getDb().getAllSync(
      `SELECT id FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habit.id, TODAY]
    );
    expect(rows).toHaveLength(1);
  });

  it('log olmayan gün tamamlanmamış sayılır', () => {
    const habit = createHabit();
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);
  });
});

describe('incrementAmount / getAmountOn', () => {
  it('miktarı artırır ve hedefe ulaşınca completed=1 yapar', () => {
    const habit = createHabit({ target_amount: 8, unit: 'bardak' });

    habitRepo.incrementAmount(habit.id, TODAY, 3, 8);
    expect(habitRepo.getAmountOn(habit.id, TODAY)).toBe(3);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);

    habitRepo.incrementAmount(habit.id, TODAY, 5, 8);
    expect(habitRepo.getAmountOn(habit.id, TODAY)).toBe(8);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(true);
  });

  it('hedefin altına düşünce completed geri 0 olur', () => {
    const habit = createHabit({ target_amount: 8 });
    habitRepo.incrementAmount(habit.id, TODAY, 8, 8);
    habitRepo.incrementAmount(habit.id, TODAY, -1, 8);
    expect(habitRepo.getAmountOn(habit.id, TODAY)).toBe(7);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);
  });

  it('0\'ın altına inmez', () => {
    const habit = createHabit({ target_amount: 8 });
    habitRepo.incrementAmount(habit.id, TODAY, 3, 8);
    habitRepo.incrementAmount(habit.id, TODAY, -5, 8);
    expect(habitRepo.getAmountOn(habit.id, TODAY)).toBe(0);
  });

  it('hedef null ya da 0 ise completed hiç 1 olmaz', () => {
    const habit = createHabit();
    habitRepo.incrementAmount(habit.id, TODAY, 100, null);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);

    habitRepo.incrementAmount(habit.id, TODAY, 100, 0);
    expect(habitRepo.isCompletedOn(habit.id, TODAY)).toBe(false);
  });

  it('kayıt olmayan günde miktar 0 döner', () => {
    const habit = createHabit();
    expect(habitRepo.getAmountOn(habit.id, TODAY)).toBe(0);
  });
});

describe('getDayStates (çoklu gün durumu)', () => {
  it('boş liste için boş nesne döner', () => {
    expect(habitRepo.getDayStates([], TODAY)).toEqual({});
  });

  it('miktar+tamamlanmayı getAmountOn/isCompletedOn ile aynı verir; logsuz alışkanlık yer almaz', () => {
    const quant = createHabit({ target_amount: 8 });        // nicel, tamamlanacak
    const binary = createHabit();                           // ikili, işaretlenecek
    const untouched = createHabit();                        // bugün log'u yok

    habitRepo.incrementAmount(quant.id, TODAY, 8, 8);       // amount 8, completed
    habitRepo.toggleLog(binary.id, TODAY, true);            // completed, amount 0

    const states = habitRepo.getDayStates([quant.id, binary.id, untouched.id], TODAY);
    expect(states[quant.id]).toEqual({ amount: 8, completed: true });
    expect(states[binary.id]).toEqual({ amount: 0, completed: true });
    // Bugün hiç log'u olmayan alışkanlık sonuçta yer almaz (çağıran 0/false varsayar).
    expect(states[untouched.id]).toBeUndefined();

    // Tekil metotlarla birebir tutarlı.
    expect(states[quant.id].amount).toBe(habitRepo.getAmountOn(quant.id, TODAY));
    expect(states[quant.id].completed).toBe(habitRepo.isCompletedOn(quant.id, TODAY));
    expect(habitRepo.getAmountOn(untouched.id, TODAY)).toBe(0);
    expect(habitRepo.isCompletedOn(untouched.id, TODAY)).toBe(false);
  });

  it('yalnızca istenen güne ait durumu döner (başka günü karıştırmaz)', () => {
    const habit = createHabit({ target_amount: 5 });
    habitRepo.incrementAmount(habit.id, '2026-06-30', 5, 5); // dün tamam
    const states = habitRepo.getDayStates([habit.id], TODAY); // bugün log yok
    expect(states[habit.id]).toBeUndefined();
  });
});

describe('currentStreak — günlük plan', () => {
  it('hiç log yoksa 0', () => {
    const habit = createHabit();
    expect(habitRepo.currentStreak(habit.id)).toBe(0);
  });

  it('bugün dahil ardışık günleri sayar', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id)).toBe(2);
  });

  it('bugün henüz işaretlenmediyse seriyi bozmaz', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    expect(habitRepo.currentStreak(habit.id)).toBe(2);
  });

  it('kaçırılan gün seriyi keser', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // önceki gün
    // 2026-06-30 kaçırıldı
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('geri alınmış (completed=0) log tamamlanmış sayılmaz', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, '2026-06-30', false);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });
});

describe('currentStreak — haftalık plan (Pzt/Çar/Cum)', () => {
  const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] };

  it('plansız günlerdeki boşluk seriyi bozmaz', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Çar
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt
    // Bugün (Çar 07-01) planlı ama işaretlenmedi -> tolerans, seri bozulmaz.
    expect(habitRepo.currentStreak(habit.id)).toBe(3);
  });

  it('bugün de işaretlenince seri artar', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt
    habitRepo.toggleLog(habit.id, TODAY, true);        // Çar (bugün)
    expect(habitRepo.currentStreak(habit.id)).toBe(3);
  });

  it('kaçırılan planlı gün seriyi keser', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Çar
    // Cum 06-26 kaçırıldı
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('plansız güne atılan işaret seriyi etkilemez', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt (planlı)
    habitRepo.toggleLog(habit.id, '2026-06-30', true); // Salı (plansız!)
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('bugün (planlı) işaretsizken bir önceki planlı gün kaçırıldıysa seri 0 (tolerans kırığı gizlemez)', () => {
    const habit = createHabit({ schedule });
    // Bugün Çar 07-01 planlı ama işaretsiz (tolerans). Bir önceki planlı gün
    // Pzt 06-29 KAÇIRILDI → seri kırık; eski Cum 06-26 completed olsa da sayılmaz.
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum (planlı, tamamlandı)
    // 06-29 Pzt işaretlenmedi
    expect(habitRepo.currentStreak(habit.id)).toBe(0);
  });

  it('bugün işaretliyken bir önceki planlı gün kaçırıldıysa seri yalnız bugün (=1)', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum (tamamlandı, eski)
    // 06-29 Pzt kaçırıldı
    habitRepo.toggleLog(habit.id, TODAY, true);        // Çar bugün (tamamlandı)
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });
});

describe('currentStreak — yaşam aralığı (start_date/end_date)', () => {
  // Bugün = 2026-07-01. Aralık dışı günler "planlı değil" sayılır:
  // ne seriyi besler ne bozar.
  it('bitişten sonraki günler seriyi bozmaz (biten alışkanlığın serisi donar)', () => {
    const habit = createHabit({ end_date: '2026-06-28' });
    habitRepo.toggleLog(habit.id, '2026-06-27', true);
    habitRepo.toggleLog(habit.id, '2026-06-28', true);
    // 29-30 Haziran ve bugün aralık dışı — kaçırılmış sayılmamalı.
    expect(habitRepo.currentStreak(habit.id)).toBe(2);
  });

  it('başlangıçtan önceki günler sayılmaz', () => {
    const habit = createHabit({ start_date: '2026-06-30' });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // aralık dışı — sayılmaz
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id)).toBe(2);
  });
});

describe('longestStreak', () => {
  it('hiç log yoksa 0', () => {
    const habit = createHabit();
    expect(habitRepo.longestStreak(habit.id)).toBe(0);
  });

  it('geçmişteki en uzun seriyi bulur, güncel olmasa bile', () => {
    const habit = createHabit();
    // Eski 3'lük seri: 24-25-26 Haziran
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-25', true);
    habitRepo.toggleLog(habit.id, '2026-06-26', true);
    // Kaçırılan gün: 27
    // Güncel 2'lik seri: 30 Haziran - bugün
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);

    expect(habitRepo.currentStreak(habit.id)).toBe(2);
    expect(habitRepo.longestStreak(habit.id)).toBe(3);
  });

  it('haftalık planda yalnızca planlı günleri sayar', () => {
    const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] }; // Pzt/Çar/Cum
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Çar
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt
    // Bugün (Çar) kaçırıldı
    expect(habitRepo.longestStreak(habit.id)).toBe(3);
  });
});

describe('logsInRange', () => {
  it('yalnızca verilen tarihten (dahil) itibaren logları döner', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);

    const logs = habitRepo.logsInRange(habit.id, '2026-06-30');
    expect(logs.map((l) => l.log_date)).toEqual(['2026-06-30', TODAY]);
  });

  it('log yoksa boş dizi döner', () => {
    const habit = createHabit();
    expect(habitRepo.logsInRange(habit.id, '2026-06-01')).toEqual([]);
  });
});

describe('allLogs / logsBetween', () => {
  it('allLogs tüm logları tarihe göre artan sırada döner', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, TODAY, true);
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    expect(habitRepo.allLogs(habit.id).map((l) => l.log_date)).toEqual([
      '2026-06-24',
      '2026-06-29',
      TODAY,
    ]);
  });

  it('logsBetween yalnızca kapalı aralıktaki logları döner', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.logsBetween(habit.id, '2026-06-25', '2026-06-30').map((l) => l.log_date)).toEqual([
      '2026-06-29',
    ]);
    // Uç değerler dahil.
    expect(habitRepo.logsBetween(habit.id, '2026-06-24', TODAY).map((l) => l.log_date)).toEqual([
      '2026-06-24',
      '2026-06-29',
      TODAY,
    ]);
  });
});

describe('allStreaks', () => {
  it('hiç log yoksa boş dizi', () => {
    const habit = createHabit();
    expect(habitRepo.allStreaks(habit.id)).toEqual([]);
  });

  it('geçmişteki tüm serileri büyükten küçüğe listeler', () => {
    const habit = createHabit();
    // Eski 3'lük: 24-25-26 Haziran
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-25', true);
    habitRepo.toggleLog(habit.id, '2026-06-26', true);
    // Kaçırılan: 27
    // Güncel 2'lik: 30 Haziran - bugün
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);

    const streaks = habitRepo.allStreaks(habit.id);
    expect(streaks).toEqual([
      { length: 3, start: '2026-06-24', end: '2026-06-26' },
      { length: 2, start: '2026-06-30', end: TODAY },
    ]);
  });

  it('haftalık planda yalnızca planlı günleri seriye katar', () => {
    const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] }; // Pzt/Çar/Cum
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Çar
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Cum
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Pzt
    expect(habitRepo.allStreaks(habit.id)).toEqual([
      { length: 3, start: '2026-06-24', end: '2026-06-29' },
    ]);
  });
});

describe('scoreHistory', () => {
  it('hiç log yoksa boş dizi', () => {
    const habit = createHabit();
    expect(habitRepo.scoreHistory(habit.id, 90)).toEqual([]);
  });

  it('her tamamlanan günde skor artar, kaçırılan günde düşer', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-28', true);
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    // 30 Haziran kaçırıldı
    habitRepo.toggleLog(habit.id, TODAY, true);

    const history = habitRepo.scoreHistory(habit.id, 90);
    const byDate = new Map(history.map((h) => [h.date, h.score]));
    expect(byDate.get('2026-06-28')!).toBeGreaterThan(0);
    expect(byDate.get('2026-06-29')!).toBeGreaterThan(byDate.get('2026-06-28')!);
    // Kaçırılan gün skoru düşürür.
    expect(byDate.get('2026-06-30')!).toBeLessThan(byDate.get('2026-06-29')!);
    // Skor her zaman 0..1 aralığında.
    for (const h of history) {
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(1);
    }
  });

  it('yalnızca istenen son N günü döner', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.scoreHistory(habit.id, 3)).toHaveLength(3);
  });

  it('plansız günde skor değişmez (bir önceki değerle taşınır)', () => {
    const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] }; // Pzt/Çar/Cum
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Çar (planlı)
    const history = habitRepo.scoreHistory(habit.id, 90);
    const byDate = new Map(history.map((h) => [h.date, h.score]));
    // 25 Haziran (Perşembe) plansız — skor 24 Haziran'la aynı kalmalı.
    expect(byDate.get('2026-06-25')).toBe(byDate.get('2026-06-24'));
  });
});

describe('hedefe bağlı ilerleme (goal_id)', () => {
  // Bağlı alışkanlık her TAMAMLANDIĞI gün hedefe +1, geri alınınca −1 katar.
  // Katkı "yapılan miktar" değil, "tamamlanan gün" başınadır.
  function createNumericGoal(target: number | null = 100) {
    return goalRepo.create({
      user_id: userId,
      title: 'Koşu hedefi',
      goal_type: 'numeric',
      target_value: target,
      unit: 'koşu',
    });
  }
  const currentValue = (goalId: string) => goalRepo.getById(goalId)!.current_value;

  it('ikili alışkanlık tamamlanınca hedefe +1, geri alınınca −1', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(1);

    habitRepo.toggleLog(habit.id, TODAY, false);
    expect(currentValue(goal.id)).toBe(0);
  });

  it('aynı durumu tekrar yazmak hedefi ETKİLEMEZ (çift sayım yok)', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(habit.id, TODAY, true);
    habitRepo.toggleLog(habit.id, TODAY, true); // geçiş yok
    expect(currentValue(goal.id)).toBe(1);
  });

  it('farklı günler ayrı ayrı +1 sayılır', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(3);
  });

  it('bağlı olmayan alışkanlık hedefe dokunmaz', () => {
    const goal = createNumericGoal();
    const habit = createHabit(); // goal_id yok
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(0);
  });

  it('nicel alışkanlık: hedefe ULAŞINCA +1, altına düşünce −1, arada değişmez', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id, target_amount: 8, unit: 'bardak' });

    habitRepo.incrementAmount(habit.id, TODAY, 3, 8); // 3/8 — henüz tamam değil
    expect(currentValue(goal.id)).toBe(0);

    habitRepo.incrementAmount(habit.id, TODAY, 5, 8); // 8/8 — tamam (0→1)
    expect(currentValue(goal.id)).toBe(1);

    habitRepo.incrementAmount(habit.id, TODAY, 2, 8); // 10/8 — hâlâ tamam, geçiş yok
    expect(currentValue(goal.id)).toBe(1);

    habitRepo.incrementAmount(habit.id, TODAY, -5, 8); // 5/8 — tamam değil (1→0)
    expect(currentValue(goal.id)).toBe(0);
  });

  it('hedef sınırını aşmaz (addProgress kırpması korunur)', () => {
    const goal = createNumericGoal(1); // hedef değeri 1
    const h1 = createHabit({ goal_id: goal.id });
    const h2 = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(h1.id, TODAY, true); // 1
    habitRepo.toggleLog(h2.id, TODAY, true); // sınırda kalır
    expect(currentValue(goal.id)).toBe(1);
  });

  it('deadline hedefe bağlı olsa bile sayaç bozulmaz (numeric guard)', () => {
    const goal = goalRepo.create({
      user_id: userId,
      title: 'Sınav',
      goal_type: 'deadline',
      deadline: '2026-08-01',
    });
    const habit = createHabit({ goal_id: goal.id });
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(0);
  });
});
