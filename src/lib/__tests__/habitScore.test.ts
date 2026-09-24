// Score tests. Model: the score STARTS AT ZERO and is earned; a neutral
// (null) bucket neither raises nor lowers the score (see the header of habitScore.ts).
//
// This file is regression protection for two past bugs:
//   (a) #21: buckets before the habit's birth suppressing the score — gone on
//       its own under the starts-at-zero model (the leading zeros already keep the score at 0),
//   (b) 2026-07-23: unscheduled days being counted as "missed" — now null.

import {
  SCORE_EMA_ALPHA,
  SCORE_EMA_ALPHA_MONTH,
  SCORE_EMA_ALPHA_WEEK,
  emaScores,
} from '../habitScore';

const last = (a: number[]) => a[a.length - 1];
const pct = (x: number) => Math.round(x * 1000) / 10; // XX.X%

describe('emaScores — temel davranış', () => {
  it('boş dizi boş döner', () => {
    expect(emaScores([])).toEqual([]);
  });

  it('girdiyle aynı uzunlukta döner (nötr kovalar dahil)', () => {
    expect(emaScores([1, null, 0, 1])).toHaveLength(4);
  });

  it('tek kaçırılmış kova %0 verir', () => {
    expect(last(emaScores([0]))).toBeCloseTo(0, 10);
  });

  it('hep kaçırılmışsa %0 kalır', () => {
    expect(last(emaScores(Array(30).fill(0)))).toBeCloseTo(0, 10);
  });

  it('sonuç her zaman 0..1 aralığında', () => {
    const scores = emaScores([1, 0, null, 1, 0, 0, 1, null, 1, 0]);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('puan SIFIRDAN başlar ve kazanılır (kullanıcı kararı 2026-07-23)', () => {
  it('ilk kusursuz kova %100 DEĞİL, alpha kadar yükselir', () => {
    expect(last(emaScores([1]))).toBeCloseTo(SCORE_EMA_ALPHA, 10);
  });

  it('her kusursuz kova puanı biraz daha yükseltir (monoton tırmanış)', () => {
    const scores = emaScores(Array(30).fill(1));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it('kusursuz gidişte puan %100\'e YAKINSAR ama aşmaz', () => {
    expect(last(emaScores(Array(10).fill(1)))).toBeLessThan(0.6); // 10 days: ~51.6%
    expect(last(emaScores(Array(200).fill(1)))).toBeGreaterThan(0.99);
    expect(last(emaScores(Array(200).fill(1)))).toBeLessThanOrEqual(1);
  });

  it('kaçırılan kova puanı geri çeker', () => {
    const perfect = last(emaScores(Array(20).fill(1)));
    const withMiss = last(emaScores([...Array(20).fill(1), 0]));
    expect(withMiss).toBeLessThan(perfect);
  });
});

describe('nötr kova (null) — plansız gün puanı düşürmez', () => {
  // MEASURED BUG (2026-07-23): a habit scheduled Mon/Wed/Fri and never missed
  // in 90 days was showing 42.7% on the Day tab — because the 4 unscheduled
  // days were counted as "didn't do it." The Week/Month tabs said 100% at the same time.
  it('nötr kova puanı DEĞİŞTİRMEZ (bir öncekini tekrarlar)', () => {
    const scores = emaScores([1, null, null, null]);
    expect(scores[1]).toBe(scores[0]);
    expect(scores[3]).toBe(scores[0]);
  });

  it('haftada 3 planlı gün kusursuzsa, plansız günler puanı bastırmaz', () => {
    const ratios: Array<number | null> = [];
    for (let i = 0; i < 90; i++) {
      const scheduled = [0, 2, 4].includes(i % 7); // Mon/Wed/Fri
      ratios.push(scheduled ? 1 : null);
    }
    // The old behavior (0 instead of null) gave 42.7% here.
    expect(pct(last(emaScores(ratios)))).toBeGreaterThan(90);
  });

  it('nötr kovalar yalnızca gecikme yaratır, tavanı düşürmez', () => {
    const seyrek = last(emaScores(Array.from({ length: 120 }, (_, i) => (i % 2 ? null : 1))));
    const yogun = last(emaScores(Array(60).fill(1)));
    expect(pct(seyrek)).toBeCloseTo(pct(yogun), 0);
  });

  it('baştaki nötr kovalar puanı 0\'da tutar, aşağı çekmez', () => {
    expect(last(emaScores([null, null, null]))).toBe(0);
    const a = last(emaScores([null, null, 1, 1, 1]));
    const b = last(emaScores([1, 1, 1]));
    expect(a).toBeCloseTo(b, 10);
  });
});

describe('emaScores — güncelliğe ağırlık verir (EMA olmanın anlamı)', () => {
  it('uzun kusursuz geçmiş + son 20 gün kaçık, ciddi düşer', () => {
    const iyi = last(emaScores(Array(80).fill(1)));
    const sonrasiKotu = last(emaScores([...Array(80).fill(1), ...Array(20).fill(0)]));
    expect(sonrasiKotu).toBeLessThan(iyi - 0.2);
  });

  it('uzun kötü geçmiş + son 20 gün kusursuz, toparlanma görünür', () => {
    const score = last(emaScores([...Array(50).fill(0), ...Array(20).fill(1)]));
    // 20 perfect days climb noticeably from zero (~76.6%) but don't hit the
    // ceiling on their own after a 50-day bad history.
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.9);
  });

  it('tek bir kaçırma oturmuş bir puanı uçurmaz (yumuşatma korunuyor)', () => {
    const ratios = [...Array(200).fill(1), 0];
    expect(last(emaScores(ratios))).toBeGreaterThan(0.9);
  });
});

describe('#21 regresyonu — hayalet kovalar artık puanı bozamaz', () => {
  // Under the starts-at-zero model, the leading zeros keep the score at 0;
  // the climb after the first real bucket is IDENTICAL to the trimmed array.
  // So trimming (trimLeading) has no mathematical effect left — it's for display only.
  it('öne eklenen hayalet sıfırlar sonucu değiştirmez', () => {
    const kesilmis = last(emaScores(Array(10).fill(1)));
    const hayaletli = last(emaScores([...Array(80).fill(0), ...Array(10).fill(1)]));
    expect(hayaletli).toBeCloseTo(kesilmis, 10);
  });
});

describe('sabitler', () => {
  it('alpha yumuşatma aralığında', () => {
    expect(SCORE_EMA_ALPHA).toBeGreaterThan(0);
    expect(SCORE_EMA_ALPHA).toBeLessThan(1);
  });

  it('hafta/ay alpha\'ları takvim-eşdeğeri: üç sekme aynı hızda sönümlenir', () => {
    const gun = last(emaScores(Array(70).fill(1), SCORE_EMA_ALPHA));       // 70 days
    const hafta = last(emaScores(Array(10).fill(1), SCORE_EMA_ALPHA_WEEK)); // 10 weeks = 70 days
    expect(pct(hafta)).toBeCloseTo(pct(gun), 0);

    const ay = last(emaScores(Array(4).fill(1), SCORE_EMA_ALPHA_MONTH));    // 4 months = 120 days
    const gun120 = last(emaScores(Array(120).fill(1), SCORE_EMA_ALPHA));
    expect(pct(ay)).toBeCloseTo(pct(gun120), 0);
  });

  it('alpha parametrik geçilebilir (daha büyük alpha = daha çevik)', () => {
    const ratios = [...Array(20).fill(0), 1];
    expect(last(emaScores(ratios, 0.5))).toBeGreaterThan(last(emaScores(ratios, 0.07)));
  });
});
