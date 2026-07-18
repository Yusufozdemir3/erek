// habitInsights testleri — kural tabanlı içgörülerin eşik davranışları.

import { buildHabitInsights } from '../habitInsights';
import { toYmd } from '../helpers';
import type { Habit, HabitLog } from '@/types/models';

const TODAY = '2026-07-16';

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    synced: 0,
    user_id: 'u1',
    goal_id: null,
    title: 'Test',
    kind: 'binary',
    remind_at: null,
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    start_date: null,
    end_date: null,
    goal_contribution: null,
    goal_factor: 1,
    ...overrides,
  };
}

function log(dateYmd: string, completed: 0 | 1): HabitLog {
  return { id: dateYmd, habit_id: 'h1', log_date: dateYmd, completed, amount: 0, updated_at: `${dateYmd}T10:00:00.000Z` };
}

// KRİTİK: habitInsights.ts'in kendi ymdAdd'i de aynı (LOKAL, toYmd tabanlı)
// mantığı kullanıyor — burada toISOString (UTC) kullanmak, yerel saat dilimi
// UTC olmayan makinelerde kütüphanenin pencereleriyle bir gün kayan, gizli bir
// tutarsızlık yaratırdı.
function ymdAdd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

describe('buildHabitInsights', () => {
  it('hiç log yoksa boş liste döner', () => {
    const insights = buildHabitInsights(makeHabit(), [], TODAY, 0, 0);
    expect(insights).toEqual([]);
  });

  it('güncel seri >=3 ve en uzun seriye eşitse streakRecord', () => {
    const insights = buildHabitInsights(makeHabit(), [], TODAY, 5, 5);
    expect(insights).toContainEqual({ kind: 'streakRecord', days: 5 });
  });

  it('güncel seri >=3 ama rekor değilse streakActive', () => {
    const insights = buildHabitInsights(makeHabit(), [], TODAY, 3, 10);
    expect(insights).toContainEqual({ kind: 'streakActive', days: 3 });
  });

  it('güncel seri <3 ise seri içgörüsü üretilmez', () => {
    const insights = buildHabitInsights(makeHabit(), [], TODAY, 2, 10);
    expect(insights.some((i) => i.kind === 'streakRecord' || i.kind === 'streakActive')).toBe(false);
  });

  it('son 7 gün önceki 7 güne göre belirgin iyileşmişse trendUp', () => {
    const logs: HabitLog[] = [];
    // Son 7 gün (bugün dahil): hepsi tamamlandı. Önceki 7 gün: hepsi kaçırıldı.
    for (let i = 0; i < 7; i++) logs.push(log(ymdAdd(TODAY, -i), 1));
    for (let i = 7; i < 14; i++) logs.push(log(ymdAdd(TODAY, -i), 0));
    const insights = buildHabitInsights(makeHabit(), logs, TODAY, 0, 0);
    expect(insights).toContainEqual({ kind: 'trendUp', recentRate: 1, priorRate: 0 });
  });

  it('fark eşiğin altındaysa (gürültü) trend içgörüsü üretilmez', () => {
    const logs: HabitLog[] = [];
    // Son 7 gün: 4/7 tamamlandı. Önceki 7 gün: 3/7 tamamlandı — fark küçük.
    for (let i = 0; i < 7; i++) logs.push(log(ymdAdd(TODAY, -i), i < 4 ? 1 : 0));
    for (let i = 7; i < 14; i++) logs.push(log(ymdAdd(TODAY, -i), i < 10 ? 1 : 0));
    const insights = buildHabitInsights(makeHabit(), logs, TODAY, 0, 0);
    expect(insights.some((i) => i.kind === 'trendUp' || i.kind === 'trendDown')).toBe(false);
  });

  it('90 günlük pencerede bir gün belirgin düşükse worstWeekday', () => {
    const habit = makeHabit();
    const logs: HabitLog[] = [];
    let worstWeekday = -1;
    for (let i = 0; i < 90; i++) {
      const ymd = ymdAdd(TODAY, -i);
      const wd = new Date(`${ymd}T00:00:00`).getDay();
      if (worstWeekday === -1) worstWeekday = (wd + 1) % 7; // takvimde ilerdeki bir gün, farklı olsun
      logs.push(log(ymd, wd === worstWeekday ? 0 : 1));
    }
    const insights = buildHabitInsights(habit, logs, TODAY, 0, 0);
    expect(insights).toContainEqual({ kind: 'worstWeekday', weekday: worstWeekday, rate: 0 });
  });

  it('kota (haftada X kez) alışkanlıkta haftanın günü içgörüsü ASLA üretilmez', () => {
    const habit = makeHabit({ schedule: { freq: 'weekly', weekdays: [], timesPerWeek: 3 } });
    const logs: HabitLog[] = [];
    for (let i = 0; i < 90; i++) {
      const ymd = ymdAdd(TODAY, -i);
      const wd = new Date(`${ymd}T00:00:00`).getDay();
      logs.push(log(ymd, wd === 1 ? 0 : 1)); // Pazartesiler hep kaçırılmış olsa bile
    }
    const insights = buildHabitInsights(habit, logs, TODAY, 0, 0);
    expect(insights.some((i) => i.kind === 'bestWeekday' || i.kind === 'worstWeekday')).toBe(false);
  });

  it('en fazla 2 içgörü döner (seri önce gelir)', () => {
    const habit = makeHabit();
    const logs: HabitLog[] = [];
    for (let i = 0; i < 7; i++) logs.push(log(ymdAdd(TODAY, -i), 1));
    for (let i = 7; i < 14; i++) logs.push(log(ymdAdd(TODAY, -i), 0));
    for (let i = 14; i < 90; i++) logs.push(log(ymdAdd(TODAY, -i), 1));
    const insights = buildHabitInsights(habit, logs, TODAY, 5, 5);
    expect(insights.length).toBeLessThanOrEqual(2);
    expect(insights[0].kind).toBe('streakRecord');
  });
});
