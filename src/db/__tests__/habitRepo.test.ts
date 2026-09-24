// habitRepo tests: CRUD, toggleLog/incrementAmount edge cases, and
// streak computation (daily + weekly schedule).
//
// The system clock is frozen so date logic is deterministic:
// "today" = 2026-07-01 (Wednesday). Prior days: 30 Tue, 29 Mon, 28 Sun,
// 27 Sat, 26 Fri, 25 Thu, 24 Wed, 23 Tue, 22 Mon...

import { getDb } from '../database';
import { habitRepo } from '../repositories/habitRepo';
import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

const TODAY = '2026-07-01'; // Wednesday

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
    // Mark it as if already synced so we can see update reset it to synced=0.
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
    const quant = createHabit({ target_amount: 8 });        // quantitative, will be completed
    const binary = createHabit();                           // binary, will be checked
    const untouched = createHabit();                        // no log today

    habitRepo.incrementAmount(quant.id, TODAY, 8, 8);       // amount 8, completed
    habitRepo.toggleLog(binary.id, TODAY, true);            // completed, amount 0

    const states = habitRepo.getDayStates([quant.id, binary.id, untouched.id], TODAY);
    expect(states[quant.id]).toEqual({ amount: 8, completed: true });
    expect(states[binary.id]).toEqual({ amount: 0, completed: true });
    // A habit with no log today is absent from the result entirely (the caller assumes 0/false).
    expect(states[untouched.id]).toBeUndefined();

    // Exactly consistent with the single-item methods.
    expect(states[quant.id].amount).toBe(habitRepo.getAmountOn(quant.id, TODAY));
    expect(states[quant.id].completed).toBe(habitRepo.isCompletedOn(quant.id, TODAY));
    expect(habitRepo.getAmountOn(untouched.id, TODAY)).toBe(0);
    expect(habitRepo.isCompletedOn(untouched.id, TODAY)).toBe(false);
  });

  it('yalnızca istenen güne ait durumu döner (başka günü karıştırmaz)', () => {
    const habit = createHabit({ target_amount: 5 });
    habitRepo.incrementAmount(habit.id, '2026-06-30', 5, 5); // completed yesterday
    const states = habitRepo.getDayStates([habit.id], TODAY); // no log today
    expect(states[habit.id]).toBeUndefined();
  });
});

// The last-7-days strip on the "Habits" screen uses this. It used to fire a
// separate recentLogs query per habit (an N+1 that grew with the list) —
// this bulk version replaced it, and the result must be exactly the same.
describe('completedDatesBetween (çoklu aralık)', () => {
  it('boş liste için boş nesne döner', () => {
    expect(habitRepo.completedDatesBetween([], '2026-06-01', TODAY)).toEqual({});
  });

  it('yalnızca TAMAMLANMIŞ günleri, alışkanlık başına küme olarak verir', () => {
    const a = createHabit();
    const b = createHabit();
    habitRepo.toggleLog(a.id, '2026-06-29', true);
    habitRepo.toggleLog(a.id, '2026-06-30', true);
    habitRepo.toggleLog(a.id, TODAY, false); // unchecked — must not count
    habitRepo.toggleLog(b.id, '2026-06-30', true);

    const out = habitRepo.completedDatesBetween([a.id, b.id], '2026-06-29', TODAY);

    expect([...out[a.id]].sort()).toEqual(['2026-06-29', '2026-06-30']);
    expect([...out[b.id]]).toEqual(['2026-06-30']);
  });

  it('aralık dışındaki günleri getirmez', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, '2026-06-01', true); // before the range
    habitRepo.toggleLog(habit.id, '2026-06-30', true);

    const out = habitRepo.completedDatesBetween([habit.id], '2026-06-29', TODAY);

    expect([...out[habit.id]]).toEqual(['2026-06-30']);
  });

  it('hiç tamamlanmış günü olmayan alışkanlık sonuçta yer almaz', () => {
    const habit = createHabit();
    expect(habitRepo.completedDatesBetween([habit.id], '2026-06-29', TODAY)[habit.id]).toBeUndefined();
  });
});

describe('currentStreak — günlük plan', () => {
  it('önceden yüklenmiş alışkanlıkla aynı sonucu verir (fazladan sorgu atmadan)', () => {
    const habit = createHabit();
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id, habit)).toBe(habitRepo.currentStreak(habit.id));
  });

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
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // previous day
    // 2026-06-30 was missed
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
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Wed
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    // Today (Wed 07-01) is scheduled but not checked -> tolerated, streak intact.
    expect(habitRepo.currentStreak(habit.id)).toBe(3);
  });

  it('bugün de işaretlenince seri artar', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    habitRepo.toggleLog(habit.id, TODAY, true);        // Wed (today)
    expect(habitRepo.currentStreak(habit.id)).toBe(3);
  });

  it('kaçırılan planlı gün seriyi keser', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Wed
    // Fri 06-26 was missed
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('plansız güne atılan işaret seriyi etkilemez', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon (scheduled)
    habitRepo.toggleLog(habit.id, '2026-06-30', true); // Tue (not scheduled!)
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('bugün (planlı) işaretsizken bir önceki planlı gün kaçırıldıysa seri 0 (tolerans kırığı gizlemez)', () => {
    const habit = createHabit({ schedule });
    // Today, Wed 07-01, is scheduled but unchecked (tolerated). The previous
    // scheduled day, Mon 06-29, was MISSED → streak is broken; the older
    // completed Fri 06-26 doesn't count even so.
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri (scheduled, completed)
    // 06-29 Mon was not checked
    expect(habitRepo.currentStreak(habit.id)).toBe(0);
  });

  it('bugün işaretliyken bir önceki planlı gün kaçırıldıysa seri yalnız bugün (=1)', () => {
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri (completed, old)
    // 06-29 Mon was missed
    habitRepo.toggleLog(habit.id, TODAY, true);        // Wed today (completed)
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });
});

describe('currentStreak — yaşam aralığı (start_date/end_date)', () => {
  // Today = 2026-07-01. Days outside the range count as "not scheduled":
  // they neither extend nor break the streak.
  it('bitişten sonraki günler seriyi bozmaz (biten alışkanlığın serisi donar)', () => {
    const habit = createHabit({ end_date: '2026-06-28' });
    habitRepo.toggleLog(habit.id, '2026-06-27', true);
    habitRepo.toggleLog(habit.id, '2026-06-28', true);
    // June 29-30 and today are outside the range — must not count as missed.
    expect(habitRepo.currentStreak(habit.id)).toBe(2);
  });

  it('başlangıçtan önceki günler sayılmaz', () => {
    const habit = createHabit({ start_date: '2026-06-30' });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // outside the range — not counted
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
    // Old streak of 3: June 24-25-26
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-25', true);
    habitRepo.toggleLog(habit.id, '2026-06-26', true);
    // Missed day: 27
    // Current streak of 2: June 30 - today
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);

    expect(habitRepo.currentStreak(habit.id)).toBe(2);
    expect(habitRepo.longestStreak(habit.id)).toBe(3);
  });

  it('haftalık planda yalnızca planlı günleri sayar', () => {
    const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] }; // Mon/Wed/Fri
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Wed
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    // Today (Wed) was missed
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
    // Boundary values included.
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
    // Old streak of 3: June 24-25-26
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-25', true);
    habitRepo.toggleLog(habit.id, '2026-06-26', true);
    // Missed: 27
    // Current streak of 2: June 30 - today
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);

    const streaks = habitRepo.allStreaks(habit.id);
    expect(streaks).toEqual([
      { length: 3, start: '2026-06-24', end: '2026-06-26' },
      { length: 2, start: '2026-06-30', end: TODAY },
    ]);
  });

  it('haftalık planda yalnızca planlı günleri seriye katar', () => {
    const schedule = { freq: 'weekly' as const, weekdays: [1, 3, 5] }; // Mon/Wed/Fri
    const habit = createHabit({ schedule });
    habitRepo.toggleLog(habit.id, '2026-06-24', true); // Wed
    habitRepo.toggleLog(habit.id, '2026-06-26', true); // Fri
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    expect(habitRepo.allStreaks(habit.id)).toEqual([
      { length: 3, start: '2026-06-24', end: '2026-06-29' },
    ]);
  });
});

describe('kota (haftada X kez) — hafta bazlı seriler', () => {
  // TODAY's week (Wed Jul 1) is Mon Jun 29 - Sun Jul 5. Previous week: Jun 22-28.
  const quota3 = { freq: 'weekly' as const, timesPerWeek: 3 };

  it('bu haftanın kotası dolunca güncel seri 1 (hafta) olur', () => {
    const habit = createHabit({ schedule: quota3 });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // Mon
    habitRepo.toggleLog(habit.id, '2026-06-30', true); // Tue
    habitRepo.toggleLog(habit.id, TODAY, true);        // Wed
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('bu hafta henüz dolmadıysa seriyi bozmaz; önceki dolu haftalar sayılır', () => {
    const habit = createHabit({ schedule: quota3 });
    // Previous week (Jun 22-28): quota met.
    habitRepo.toggleLog(habit.id, '2026-06-22', true);
    habitRepo.toggleLog(habit.id, '2026-06-24', true);
    habitRepo.toggleLog(habit.id, '2026-06-26', true);
    // This week: only 1 (quota not met, but the week isn't over → tolerated).
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
  });

  it('araya kota dolmamış tam hafta girerse seri kırılır', () => {
    const habit = createHabit({ schedule: quota3 });
    // 2 weeks ago (Jun 15-21): quota met.
    habitRepo.toggleLog(habit.id, '2026-06-15', true);
    habitRepo.toggleLog(habit.id, '2026-06-16', true);
    habitRepo.toggleLog(habit.id, '2026-06-17', true);
    // Last week (Jun 22-28) only 1 → quota not met.
    habitRepo.toggleLog(habit.id, '2026-06-23', true);
    // This week met.
    habitRepo.toggleLog(habit.id, '2026-06-29', true);
    habitRepo.toggleLog(habit.id, '2026-06-30', true);
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(habitRepo.currentStreak(habit.id)).toBe(1);
    expect(habitRepo.longestStreak(habit.id)).toBe(1);
  });

  it('longestStreak/allStreaks hafta sayar; allStreaks hafta aralığı döner', () => {
    const habit = createHabit({ schedule: { freq: 'weekly', timesPerWeek: 2 } });
    // Jun 15-21: 2 ✓, Jun 22-28: 2 ✓ → a 2-week streak.
    habitRepo.toggleLog(habit.id, '2026-06-15', true);
    habitRepo.toggleLog(habit.id, '2026-06-18', true);
    habitRepo.toggleLog(habit.id, '2026-06-22', true);
    habitRepo.toggleLog(habit.id, '2026-06-27', true);
    expect(habitRepo.longestStreak(habit.id)).toBe(2);
    const streaks = habitRepo.allStreaks(habit.id);
    // start = the first week's Monday, end = the last week's Sunday.
    expect(streaks[0]).toEqual({ length: 2, start: '2026-06-15', end: '2026-06-28' });
  });

  it('completionsInWeek verilen günün haftasındaki tamamlanan gün sayısıdır', () => {
    const habit = createHabit({ schedule: quota3 });
    habitRepo.toggleLog(habit.id, '2026-06-29', true); // this week
    habitRepo.toggleLog(habit.id, TODAY, true);        // this week
    habitRepo.toggleLog(habit.id, '2026-06-28', true); // previous week's Sunday
    expect(habitRepo.completionsInWeek(habit.id, TODAY)).toBe(2);
    expect(habitRepo.completionsInWeek(habit.id, '2026-06-28')).toBe(1);
  });
});

describe('hedefe bağlı ilerleme (goal_id)', () => {
  // A linked habit adds +1 to the goal for every day it's COMPLETED, and -1 when unchecked.
  // The contribution is per "completed day", not per "amount done".
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

  // The contribution also lands in the goal's ENTRY HISTORY: previously only
  // current_value changed and no trace was left in history → the goal's
  // tempo/projection (computed only from manual "Add" entries) never saw the linked habit.
  it('tamamlanma katkısı hedefin girdi geçmişine yazılır (+1 / −1)', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(goalEntryRepo.listByGoal(goal.id).map((e) => e.amount)).toEqual([1]);

    habitRepo.toggleLog(habit.id, TODAY, false);
    expect(goalEntryRepo.listByGoal(goal.id).map((e) => e.amount).sort()).toEqual([-1, 1]);
  });

  it('aynı durumu tekrar yazmak girdi geçmişine bir şey eklemez', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(habit.id, TODAY, true);
    habitRepo.toggleLog(habit.id, TODAY, true); // no state change → no contribution either
    expect(goalEntryRepo.listByGoal(goal.id)).toHaveLength(1);
  });

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
    habitRepo.toggleLog(habit.id, TODAY, true); // no state change
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
    const habit = createHabit(); // no goal_id
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(0);
  });

  it('nicel alışkanlık: hedefe ULAŞINCA +1, altına düşünce −1, arada değişmez', () => {
    const goal = createNumericGoal();
    const habit = createHabit({ goal_id: goal.id, target_amount: 8, unit: 'bardak' });

    habitRepo.incrementAmount(habit.id, TODAY, 3, 8); // 3/8 — not yet complete
    expect(currentValue(goal.id)).toBe(0);

    habitRepo.incrementAmount(habit.id, TODAY, 5, 8); // 8/8 — complete (0→1)
    expect(currentValue(goal.id)).toBe(1);

    habitRepo.incrementAmount(habit.id, TODAY, 2, 8); // 10/8 — still complete, no state change
    expect(currentValue(goal.id)).toBe(1);

    habitRepo.incrementAmount(habit.id, TODAY, -5, 8); // 5/8 — not complete (1→0)
    expect(currentValue(goal.id)).toBe(0);
  });

  // A goal is a THRESHOLD, not a CAP (see goalRepo.addProgress): contributions
  // still count after the goal is filled. With the clamp in place this scenario
  // was asymmetric — the second habit's +1 got swallowed but its -1 was still
  // applied, meaning a check→uncheck cycle silently stole progress from the goal.
  it('hedef dolduktan sonraki katkılar da sayılır ve geri alma simetriktir', () => {
    const goal = createNumericGoal(1); // target value of 1
    const h1 = createHabit({ goal_id: goal.id });
    const h2 = createHabit({ goal_id: goal.id });

    habitRepo.toggleLog(h1.id, TODAY, true); // 1 — goal filled
    habitRepo.toggleLog(h2.id, TODAY, true); // 2 — goes above the threshold
    expect(currentValue(goal.id)).toBe(2);

    habitRepo.toggleLog(h2.id, TODAY, false); // unchecked → returns exactly to where it started
    expect(currentValue(goal.id)).toBe(1);
  });

  it('parçalı (milestone) hedefe bağlı olsa bile sayaç bozulmaz (numeric guard)', () => {
    const goal = goalRepo.create({
      user_id: userId,
      title: 'Sınav',
      goal_type: 'milestone',
      deadline: '2026-08-01',
    });
    const habit = createHabit({ goal_id: goal.id });
    habitRepo.toggleLog(habit.id, TODAY, true);
    expect(currentValue(goal.id)).toBe(0);
  });
});

describe('hedefe bağlı ilerleme — "amount" katkı modu', () => {
  // Unlike per_completion: it doesn't wait for completion — on EVERY amount
  // change, the actual delta × goal_factor is added straight to the goal (for unit conversion).
  function createNumericGoal(target: number | null = 10, unit = 'litre') {
    return goalRepo.create({
      user_id: userId,
      title: 'Su hedefi',
      goal_type: 'numeric',
      target_value: target,
      unit,
    });
  }
  const currentValue = (goalId: string) => goalRepo.getById(goalId)!.current_value;

  it('miktar katkısı hedefin girdi geçmişine yazılır (fark × çarpan)', () => {
    const goal = createNumericGoal(10);
    const habit = createHabit({
      goal_id: goal.id,
      target_amount: 5,
      unit: 'bardak',
      goal_contribution: 'amount',
      goal_factor: 0.2, // 1 cup = 0.2 liter
    });

    habitRepo.incrementAmount(habit.id, TODAY, 3, 5);
    const entries = goalEntryRepo.listByGoal(goal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBeCloseTo(0.6); // 3 cups × 0.2
  });

  it('tamamlanma beklemeden, her artışta fark × çarpan hedefe eklenir', () => {
    const goal = createNumericGoal(10);
    const habit = createHabit({
      goal_id: goal.id,
      target_amount: 5,
      unit: 'bardak',
      goal_contribution: 'amount',
      goal_factor: 0.25,
    });

    habitRepo.incrementAmount(habit.id, TODAY, 2, 5); // 2/5 — not yet complete
    expect(currentValue(goal.id)).toBe(0.5); // 2 × 0.25

    habitRepo.incrementAmount(habit.id, TODAY, 3, 5); // 5/5 — complete, contribution still by delta
    expect(currentValue(goal.id)).toBeCloseTo(1.25); // (2+3) × 0.25
  });

  it('miktar azaltılınca (geri alma) hedeften de aynı oranda düşer', () => {
    const goal = createNumericGoal(10);
    const habit = createHabit({
      goal_id: goal.id,
      target_amount: 5,
      unit: 'bardak',
      goal_contribution: 'amount',
      goal_factor: 0.25,
    });
    habitRepo.incrementAmount(habit.id, TODAY, 5, 5);
    expect(currentValue(goal.id)).toBeCloseTo(1.25);
    habitRepo.incrementAmount(habit.id, TODAY, -2, 5);
    expect(currentValue(goal.id)).toBeCloseTo(0.75); // (5-2) × 0.25
  });

  it('0 tabanına kırpılınca hedefe İSTENEN değil GERÇEK uygulanan fark yansır', () => {
    const goal = createNumericGoal(10);
    const habit = createHabit({
      goal_id: goal.id,
      target_amount: 5,
      unit: 'bardak',
      goal_contribution: 'amount',
      goal_factor: 1,
    });
    habitRepo.incrementAmount(habit.id, TODAY, 2, 5); // amount 0→2
    expect(currentValue(goal.id)).toBe(2);
    habitRepo.incrementAmount(habit.id, TODAY, -10, 5); // requested -10, actual delta -2 (clamped to 0)
    expect(currentValue(goal.id)).toBe(0);
  });

  it('çarpan birim dönüşümü sağlar (5 bardak × 0.2 = 1 litre)', () => {
    const goal = createNumericGoal(7, 'litre');
    const habit = createHabit({
      goal_id: goal.id,
      target_amount: 5,
      unit: 'bardak',
      goal_contribution: 'amount',
      goal_factor: 0.2,
    });
    habitRepo.incrementAmount(habit.id, TODAY, 5, 5);
    expect(currentValue(goal.id)).toBeCloseTo(1);
  });

  it('goal_contribution belirtilmezse (varsayılan) eski per_completion davranışı korunur', () => {
    const goal = createNumericGoal(10);
    const habit = createHabit({ goal_id: goal.id, target_amount: 5, unit: 'bardak' }); // no goal_contribution
    habitRepo.incrementAmount(habit.id, TODAY, 2, 5); // not yet complete
    expect(currentValue(goal.id)).toBe(0);
    habitRepo.incrementAmount(habit.id, TODAY, 3, 5); // 5/5 complete → +1
    expect(currentValue(goal.id)).toBe(1);
  });
});
