// Puan testleri. Model: puan SIFIRDAN başlar ve kazanılır; nötr (null) kova
// puanı ne yükseltir ne düşürür (bkz. habitScore.ts başlığı).
//
// Bu dosya iki eski hatanın da regresyon korumasıdır:
//   (a) #21: doğumdan önceki kovaların puanı bastırması — sıfırdan-başlayan
//       modelde kendiliğinden yok (baştaki sıfırlar puanı zaten 0'da tutar),
//   (b) 2026-07-23: plansız günlerin "kaçırıldı" sayılması — artık null.

import {
  SCORE_EMA_ALPHA,
  SCORE_EMA_ALPHA_MONTH,
  SCORE_EMA_ALPHA_WEEK,
  emaScores,
} from '../habitScore';

const last = (a: number[]) => a[a.length - 1];
const pct = (x: number) => Math.round(x * 1000) / 10; // %XX.X

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
    expect(last(emaScores(Array(10).fill(1)))).toBeLessThan(0.6); // 10 gün: ~%51.6
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
  // ÖLÇÜLEN HATA (2026-07-23): Pzt/Çar/Cum planlı, 90 gün hiç kaçırılmamış
  // alışkanlık Gün sekmesinde %42.7 gösteriyordu — plansız 4 gün "yapmadın"
  // sayıldığı için. Hafta/Ay sekmeleri aynı anda %100 diyordu.
  it('nötr kova puanı DEĞİŞTİRMEZ (bir öncekini tekrarlar)', () => {
    const scores = emaScores([1, null, null, null]);
    expect(scores[1]).toBe(scores[0]);
    expect(scores[3]).toBe(scores[0]);
  });

  it('haftada 3 planlı gün kusursuzsa, plansız günler puanı bastırmaz', () => {
    const ratios: Array<number | null> = [];
    for (let i = 0; i < 90; i++) {
      const scheduled = [0, 2, 4].includes(i % 7); // Pzt/Çar/Cum
      ratios.push(scheduled ? 1 : null);
    }
    // Eski davranış (null yerine 0) burada %42.7 veriyordu.
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
    // 20 kusursuz gün sıfırdan belirgin biçimde tırmandırır (~%76.6) ama
    // 50 günlük kötü geçmişin ardından tek başına tavan YAPMAZ.
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(0.9);
  });

  it('tek bir kaçırma oturmuş bir puanı uçurmaz (yumuşatma korunuyor)', () => {
    const ratios = [...Array(200).fill(1), 0];
    expect(last(emaScores(ratios))).toBeGreaterThan(0.9);
  });
});

describe('#21 regresyonu — hayalet kovalar artık puanı bozamaz', () => {
  // Sıfırdan-başlayan modelde baştaki sıfırlar puanı 0'da tutar; ilk gerçek
  // kovadan sonraki tırmanış kesilmiş diziyle BİREBİR aynıdır. Yani kesmenin
  // (trimLeading) matematiksel bir etkisi kalmadı — yalnız görünüm için.
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
    const gun = last(emaScores(Array(70).fill(1), SCORE_EMA_ALPHA));       // 70 gün
    const hafta = last(emaScores(Array(10).fill(1), SCORE_EMA_ALPHA_WEEK)); // 10 hafta = 70 gün
    expect(pct(hafta)).toBeCloseTo(pct(gun), 0);

    const ay = last(emaScores(Array(4).fill(1), SCORE_EMA_ALPHA_MONTH));    // 4 ay = 120 gün
    const gun120 = last(emaScores(Array(120).fill(1), SCORE_EMA_ALPHA));
    expect(pct(ay)).toBeCloseTo(pct(gun120), 0);
  });

  it('alpha parametrik geçilebilir (daha büyük alpha = daha çevik)', () => {
    const ratios = [...Array(20).fill(0), 1];
    expect(last(emaScores(ratios, 0.5))).toBeGreaterThan(last(emaScores(ratios, 0.07)));
  });
});
