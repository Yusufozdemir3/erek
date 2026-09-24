// goalProjection tests.
//
// MODEL (user decision 2026-07-23): since start and end date are REQUIRED,
// all calculations are done along that axis:
//   • avgDaily   = current / days elapsed (NOT a rolling 7/30-day window)
//   • last7Total = the sum of entries in the last 7 days (since the question itself is windowed)
//   • projectedFinishDate  = today + remaining/avgDaily
//   • projectedAtDeadline  = current + avgDaily × days left (if the deadline has passed: current)
//   • behindAmount         = target − projectedAtDeadline

import { goalProjection, type GoalEntryLike } from '../goalProjection';

const TODAY = '2026-07-16';
const entry = (amount: number, day: string): GoalEntryLike => ({
  amount,
  updated_at: `${day}T10:00:00.000Z`,
});

describe('goalProjection — yaşanan gün ekseni', () => {
  it('bugün açılan hedefte yaşanan gün 1\'dir (bugün dahil)', () => {
    // Dividing by a fixed 7 would give 3/7≈0.43 — but the actual rate is 3/day.
    const p = goalProjection({
      entries: [entry(1, TODAY), entry(1, TODAY), entry(1, TODAY)],
      target: 21,
      current: 3,
      remaining: 18,
      daysLeft: 22,
      completed: false,
      today: TODAY,
      startDate: TODAY,
    });
    expect(p.daysElapsed).toBe(1);
    expect(p.last7Total).toBe(3);
    expect(p.avgDaily).toBeCloseTo(3);
  });

  it('avgDaily girdilerden DEĞİL mevcut değer / yaşanan günden hesaplanır', () => {
    // Started 10 days ago (11 days including today), current 55 -> 5/day.
    // Even with incomplete entry history (only 1 row), the rate comes out correct.
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 55,
      remaining: 145,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.daysElapsed).toBe(11);
    expect(p.avgDaily).toBeCloseTo(5);
    expect(p.last7Total).toBe(10); // "how much have I done in the last 7 days" is a separate question
  });

  it('negatif düzeltme temposu SIFIRLAMAZ (eski hata: kartlar kaybolurdu)', () => {
    // The user undid an incorrect 20 they'd entered: the last 7 days' net is negative.
    const p = goalProjection({
      entries: [entry(-20, TODAY), entry(30, '2026-07-14')],
      target: 200,
      current: 50,
      remaining: 150,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.last7Total).toBe(10); // -20 + 30
    expect(p.avgDaily).toBeCloseTo(50 / 11); // current/days elapsed — unaffected by the negative
    expect(p.projectedFinishDate).not.toBeNull();
  });

  it('startDate yoksa (eski hedef) en eski girdinin gününe düşülür', () => {
    const p = goalProjection({
      entries: [entry(3, TODAY)],
      target: 21,
      current: 3,
      remaining: 18,
      daysLeft: 22,
      completed: false,
      today: TODAY,
    });
    expect(p.daysElapsed).toBe(1);
    expect(p.avgDaily).toBeCloseTo(3);
  });

  it('ne başlangıç ne girdi varsa hiçbir şey hesaplanmaz', () => {
    const p = goalProjection({
      entries: [],
      target: 200,
      current: 0,
      remaining: 200,
      daysLeft: 15,
      completed: false,
      today: TODAY,
    });
    expect(p.avgDaily).toBeNull();
    expect(p.daysElapsed).toBeNull();
    expect(p.projectedFinishDate).toBeNull();
  });

  it('hiç ilerleme yoksa hız null (bitiş tahmini de yok)', () => {
    const p = goalProjection({
      entries: [],
      target: 200,
      current: 0,
      remaining: 200,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.avgDaily).toBeNull();
    expect(p.projectedFinishDate).toBeNull();
    expect(p.daysElapsed).toBe(11); // days elapsed is still known
  });
});

describe('goalProjection — projeksiyonlar', () => {
  it('yavaş tempo son tarihi kaçırıyorsa "açık" (behind > 0)', () => {
    // Open for 11 days, 55/200 -> 5/day. In 15 days, 55+75=130 -> shortfall of 70.
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 55,
      remaining: 145,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedAtDeadline).toBeCloseTo(130);
    expect(p.behindAmount).toBeCloseTo(70);
    expect(p.projectedFinishDate! > '2026-07-31').toBe(true); // after the deadline
  });

  it('hızlı tempo hedefi aşacaksa "fazla" (behind < 0)', () => {
    // Open for 11 days — not 110/100: 11 days, current 55, target 100 -> 5/day,
    // in 10 more days: 105 -> exceeds the target by 5.
    const p = goalProjection({
      entries: [entry(20, '2026-07-15')],
      target: 100,
      current: 55,
      remaining: 45,
      daysLeft: 10,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.avgDaily).toBeCloseTo(5);
    expect(p.projectedAtDeadline).toBeCloseTo(105);
    expect(p.behindAmount).toBeCloseTo(-5);
  });

  it('SON TARİH GEÇTİYSE tahmin değil GERÇEKLEŞEN gösterilir (kart kaybolmaz)', () => {
    const p = goalProjection({
      entries: [entry(10, '2026-07-10')],
      target: 200,
      current: 120,
      remaining: 80,
      daysLeft: -5, // the deadline was 5 days ago
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedAtDeadline).toBe(120); // what's on hand that day
    expect(p.behindAmount).toBeCloseTo(80); // remaining amount = shortfall
  });

  it('tamamlanmış hedefte bitiş tahmini üretilmez', () => {
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 200,
      remaining: 0,
      daysLeft: 5,
      completed: true,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedFinishDate).toBeNull();
    expect(p.avgDaily).not.toBeNull(); // the rate can still be shown
    // NO forward extrapolation: since addProgress used to clamp at the target, "you'll exceed it" would have been wrong.
    expect(p.projectedAtDeadline).toBe(200);
    expect(p.behindAmount).toBe(0);
  });

  it('son tarih yoksa bitiş tahmini var ama açık yok', () => {
    const p = goalProjection({
      entries: [entry(14, '2026-07-15')],
      target: 200,
      current: 100,
      remaining: 100,
      daysLeft: null,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedFinishDate).not.toBeNull();
    expect(p.projectedAtDeadline).toBeNull();
    expect(p.behindAmount).toBeNull();
  });

  it('çok yavaş hızda saçma/geçersiz tarih üretmez (10 yıl sınırı)', () => {
    // Open for 100 days, current 1 -> 0.01/day. Remaining 9999 -> ~1 million days.
    const p = goalProjection({
      entries: [entry(1, '2026-04-07')],
      target: 10000,
      current: 1,
      remaining: 9999,
      daysLeft: 30,
      completed: false,
      today: TODAY,
      startDate: '2026-04-07',
    });
    expect(p.avgDaily).toBeGreaterThan(0);
    expect(p.projectedFinishDate).toBeNull(); // "won't finish at this rate"
  });
});

describe('goalProjection — son 7 gün', () => {
  it('pencere yaşanan günü aşamaz (2 günlük hedefte 2 günün toplamı)', () => {
    const p = goalProjection({
      entries: [entry(5, TODAY), entry(4, '2026-07-15'), entry(99, '2026-07-01')],
      target: 100,
      current: 9,
      remaining: 91,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-07-15',
    });
    expect(p.daysElapsed).toBe(2);
    expect(p.last7Total).toBe(9); // 2-day window: the old 99 doesn't count
  });

  it('7 günden eski girdiler toplama girmez', () => {
    const p = goalProjection({
      entries: [entry(5, TODAY), entry(50, '2026-07-01')],
      target: 100,
      current: 55,
      remaining: 45,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-06-16',
    });
    expect(p.last7Total).toBe(5);
  });
});
