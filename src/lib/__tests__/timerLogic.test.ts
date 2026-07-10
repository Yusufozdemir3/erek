// Zamanlayıcı saf zaman matematiği testleri. `now` parametresi sabitlenerek
// duvar-saati davranışı deterministik doğrulanır — uygulama kapalıyken geçen
// süre, hedef sınırı, saat geri alma ve gece yarısı devri kararı dahil.

import { commitDelta, elapsedOf, isFinished, type ActiveTimer } from '../timerLogic';

const T0 = 1_750_000_000_000; // sabit başlangıç anı (epoch ms)

function timer(over: Partial<ActiveTimer> = {}): ActiveTimer {
  return {
    habitId: 'h1',
    date: '2026-07-08',
    startedAt: T0,
    baseSeconds: 0,
    targetSeconds: 20 * 60, // 20 dk
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

  it('hedefi AŞMAZ (uygulama saatlerce kapalı kalsa da)', () => {
    expect(elapsedOf(timer(), T0 + 5 * 3600_000)).toBe(1200);
  });

  it('saat geri alınmışsa (now < startedAt) negatife düşmez, base kalır', () => {
    expect(elapsedOf(timer({ baseSeconds: 45 }), T0 - 60_000)).toBe(45);
  });
});

describe('commitDelta', () => {
  it('yalnızca bu seansta koşan kısmı verir (base hariç)', () => {
    expect(commitDelta(timer({ baseSeconds: 300 }), T0 + 120_000)).toBe(120);
  });

  it('hedefte kırpılır: base + delta hedefi aşamaz', () => {
    // base 18 dk, hedef 20 dk, 10 dk koşmuş → yalnız 2 dk yazılır.
    expect(commitDelta(timer({ baseSeconds: 18 * 60 }), T0 + 10 * 60_000)).toBe(120);
  });

  it('tam saniyeye yuvarlar ve asla negatif olmaz', () => {
    expect(commitDelta(timer(), T0 + 1_499)).toBe(1);   // 1.499 sn → 1
    expect(commitDelta(timer(), T0 + 1_500)).toBe(2);   // 1.5 sn → 2
    expect(commitDelta(timer(), T0 - 5_000)).toBe(0);   // saat geri alınmış
  });

  it('GECE YARISI KARARI: 23:50 → 00:20 seansının tamamı tek delta olarak döner (başlangıç gününe yazılır)', () => {
    // Karar: seans başladığı güne yazılır (a.date sabit). 30 dk'nın tamamı
    // tek parçadır; gün dönümünde bölünmez.
    const a = timer({ date: '2026-07-08' }); // 23:50'de başladı varsay
    expect(commitDelta(a, T0 + 30 * 60_000)).toBe(1200); // hedefte (20 dk) kırpılmış
    expect(a.date).toBe('2026-07-08'); // gün alanı değişmez — hep başlangıç günü
  });
});

describe('isFinished', () => {
  it('hedefin altında false, hedefte ve üstünde true', () => {
    expect(isFinished(timer(), T0 + 19 * 60_000)).toBe(false);
    expect(isFinished(timer(), T0 + 20 * 60_000)).toBe(true);
    expect(isFinished(timer(), T0 + 999 * 60_000)).toBe(true);
  });

  it('açılışta geri yükleme senaryosu: kapalıyken hedef dolduysa true (hemen tamamla)', () => {
    // Kullanıcı 20 dk hedefli timer başlattı, uygulamayı kapattı, 1 saat sonra açtı.
    expect(isFinished(timer(), T0 + 3600_000)).toBe(true);
  });

  it('base zaten hedefe eşitse anında bitmiştir', () => {
    expect(isFinished(timer({ baseSeconds: 20 * 60 }), T0)).toBe(true);
  });
});
