// Timer math with `now` pinned: time passing while closed, the target, a clock
// turned back, midnight.

import {
  commitDelta,
  elapsedOf,
  isFinished,
  isStaleSession,
  restoreCommitDelta,
  type ActiveTimer,
} from '../timerLogic';

const DAY_MS = 86_400_000;

const T0 = 1_750_000_000_000; // fixed start moment (epoch ms)

function timer(over: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    kind: 'habit',
    targetId: 'h1',
    date: '2026-07-08',
    startedAt: T0,
    baseSeconds: 0,
    targetSeconds: 20 * 60, // 20 min
    ...over,
  };
}

describe('elapsedOf', () => {
  it('başlangıç anında base kadardır', () => {
    expect(elapsedOf(timer(), T0)).toBe(0);
    expect(elapsedOf(timer({ baseSeconds: 90 }), T0)).toBe(90);
  });

  it('geçen süreyi base üstüne ekler', () => {
    expect(elapsedOf(timer(), T0 + 5 * 60_000)).toBe(300);
    expect(elapsedOf(timer({ baseSeconds: 60 }), T0 + 30_000)).toBe(90);
  });

  it('hedefte kırpılmaz (kullanıcı hedefi geçtikten sonra da devam edebilir)', () => {
    expect(elapsedOf(timer(), T0 + 5 * 3600_000)).toBe(5 * 3600);
  });

  it('saat geri alınmışsa (now < startedAt) negatife düşmez, base kalır', () => {
    expect(elapsedOf(timer({ baseSeconds: 45 }), T0 - 60_000)).toBe(45);
  });
});

describe('commitDelta', () => {
  it('yalnızca bu seansta koşan kısmı verir (base hariç)', () => {
    expect(commitDelta(timer({ baseSeconds: 300 }), T0 + 120_000)).toBe(120);
  });

  it('hedefte kırpılmaz: koşan sürenin tamamı yazılır', () => {
    // base 18 min, target 20 min, ran for 10 min → the full 10 min is written, not cut off at 2 min.
    expect(commitDelta(timer({ baseSeconds: 18 * 60 }), T0 + 10 * 60_000)).toBe(600);
  });

  it('tam saniyeye yuvarlar ve asla negatif olmaz', () => {
    expect(commitDelta(timer(), T0 + 1_499)).toBe(1);   // 1.499 sn → 1
    expect(commitDelta(timer(), T0 + 1_500)).toBe(2);   // 1.5 sn → 2
    expect(commitDelta(timer(), T0 - 5_000)).toBe(0);   // clock turned back
  });

  it('GECE YARISI KARARI: 23:50 → 00:20 seansının tamamı tek delta olarak döner (başlangıç gününe yazılır)', () => {
    // All 30 minutes go to the starting day, unsplit and unclamped.
    const a = timer({ date: '2026-07-08' }); // assume it started at 23:50
    expect(commitDelta(a, T0 + 30 * 60_000)).toBe(1800);
    expect(a.date).toBe('2026-07-08'); // the date field doesn't change — always the starting day
  });
});

describe('isFinished', () => {
  it('hedefin altında false, hedefte ve üstünde true', () => {
    expect(isFinished(timer(), T0 + 19 * 60_000)).toBe(false);
    expect(isFinished(timer(), T0 + 20 * 60_000)).toBe(true);
    expect(isFinished(timer(), T0 + 999 * 60_000)).toBe(true);
  });

  it('açılışta geri yükleme senaryosu: kapalıyken hedef dolduysa true (hemen tamamla)', () => {
    // The user started a timer with a 20-minute target, closed the app, and reopened it an hour later.
    expect(isFinished(timer(), T0 + 3600_000)).toBe(true);
  });

  it('base zaten hedefe eşitse anında bitmiştir', () => {
    expect(isFinished(timer({ baseSeconds: 20 * 60 }), T0)).toBe(true);
  });
});

// Restoring after the process died: the wall clock no longer tells the truth.
describe('isStaleSession', () => {
  it('aynı gün + hedef dolmamış: seans sürüyor sayılır', () => {
    expect(isStaleSession(timer(), '2026-07-08', T0 + 5 * 60_000)).toBe(false);
  });

  it('gün değiştiyse bayattır (kayıt geçmiş bir güne gidecekti)', () => {
    expect(isStaleSession(timer(), '2026-07-09', T0 + 5 * 60_000)).toBe(true);
  });

  it('kapalıyken hedef dolduysa bayattır', () => {
    expect(isStaleSession(timer(), '2026-07-08', T0 + 25 * 60_000)).toBe(true);
  });
});

describe('restoreCommitDelta', () => {
  it('İKİ GÜN KAPALI KALAN SEANS: 48 saat değil, hedefe kalan kadarı yazılır', () => {
    // Reopened two days later: must not book ~172800 seconds on the starting day.
    const a = timer();
    expect(commitDelta(a, T0 + 2 * DAY_MS)).toBe(2 * 86_400); // raw wall clock: 48 hours
    expect(restoreCommitDelta(a, T0 + 2 * DAY_MS)).toBe(20 * 60); // written: capped at the target
  });

  it('kısmen dolu seansta yalnızca hedefe KALAN kadarı yazılır', () => {
    // base 18 min, target 20 min → at most 2 minutes can be written.
    expect(restoreCommitDelta(timer({ baseSeconds: 18 * 60 }), T0 + 5 * DAY_MS)).toBe(120);
  });

  it('base zaten hedefteyse hiçbir şey yazılmaz (o aralık hakkında bilgi yok)', () => {
    expect(restoreCommitDelta(timer({ baseSeconds: 20 * 60 }), T0 + DAY_MS)).toBe(0);
    expect(restoreCommitDelta(timer({ baseSeconds: 30 * 60 }), T0 + DAY_MS)).toBe(0);
  });

  it('hedefin altındaki kısa aralıkta kırpma YOK — commitDelta ile aynıdır', () => {
    const a = timer();
    expect(restoreCommitDelta(a, T0 + 5 * 60_000)).toBe(commitDelta(a, T0 + 5 * 60_000));
  });

  it('saat geri alınmışsa negatif olmaz', () => {
    expect(restoreCommitDelta(timer(), T0 - 5_000)).toBe(0);
  });
});
