// Puan (EMA + yanlılık düzeltmesi) testleri — denetim bulgusu #21'in regresyon
// koruması. Buradaki senaryolar hatanın İKİ yüzünü de kilitliyor:
//   (a) alışkanlığın doğumundan önceki günlerin puanı bastırması,
//   (b) sadece (a)'yı düzeltip ilk oranla tohumlamanın ayna görüntüsü hatası.

import { SCORE_EMA_ALPHA, SCORE_MIN_DAYS, emaScores } from '../habitScore';

const last = (a: number[]) => a[a.length - 1];
const pct = (x: number) => Math.round(x * 1000) / 10; // %XX.X

describe('emaScores — temel davranış', () => {
  it('boş dizi boş döner', () => {
    expect(emaScores([])).toEqual([]);
  });

  it('girdiyle aynı uzunlukta döner', () => {
    expect(emaScores([1, 0, 1, 1])).toHaveLength(4);
  });

  it('tek kusursuz kova %100 verir (tohum yanlılığı yok)', () => {
    expect(last(emaScores([1]))).toBeCloseTo(1, 10);
  });

  it('tek kaçırılmış kova %0 verir', () => {
    expect(last(emaScores([0]))).toBeCloseTo(0, 10);
  });

  it('hep kusursuzsa uzunluk ne olursa olsun %100 kalır', () => {
    for (const n of [1, 3, 7, 30, 90]) {
      expect(last(emaScores(Array(n).fill(1)))).toBeCloseTo(1, 10);
    }
  });

  it('hep kaçırılmışsa %0 kalır', () => {
    expect(last(emaScores(Array(30).fill(0)))).toBeCloseTo(0, 10);
  });

  it('sonuç her zaman 0..1 aralığında', () => {
    const scores = emaScores([1, 0, 1, 1, 0, 0, 1, 1, 1, 0]);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('emaScores — az veride düz ortalamaya yakınsar (tohum yanlılığı yok)', () => {
  // ESKİ HATA (b): ilk oranla tohumlamak ilk güne tüm ağırlığı verirdi.
  // "1 gün yaptım, 6 gün kaçırdım" tohumlu sürümde %64.7 çıkıyordu.
  it('1 yapıldı + 6 kaçırıldı, düz ortalamaya (%14.3) yakın olmalı — %60lar DEĞİL', () => {
    const score = last(emaScores([1, 0, 0, 0, 0, 0, 0]));
    expect(pct(score)).toBeLessThan(20);
    expect(pct(score)).toBeGreaterThan(5);
  });

  it('1 kaçırıldı + 6 yapıldı, yüksek olmalı (%85.7 civarı)', () => {
    const score = last(emaScores([0, 1, 1, 1, 1, 1, 1]));
    expect(pct(score)).toBeGreaterThan(80);
  });

  it('yarı yarıya bir geçmiş %50 civarında kalır', () => {
    const alternating = Array.from({ length: 30 }, (_, i) => i % 2);
    expect(pct(last(emaScores(alternating)))).toBeGreaterThan(40);
    expect(pct(last(emaScores(alternating)))).toBeLessThan(60);
  });
});

describe('emaScores — güncelliğe ağırlık verir (EMA olmanın anlamı)', () => {
  it('uzun kusursuz geçmiş + son 10 gün kaçık, düz ortalamanın ÇOK altında', () => {
    const ratios = [...Array(50).fill(1), ...Array(10).fill(0)];
    const flat = ratios.reduce((a, b) => a + b, 0) / ratios.length; // %83.3
    const score = last(emaScores(ratios));
    expect(score).toBeLessThan(flat - 0.2); // güncellik cezası gerçekten uygulanıyor
  });

  it('uzun kötü geçmiş + son 20 gün kusursuz, düz ortalamanın ÜSTÜnde (toparlanma ödüllenir)', () => {
    const ratios = [...Array(50).fill(0), ...Array(20).fill(1)];
    const flat = ratios.reduce((a, b) => a + b, 0) / ratios.length; // %28.6
    expect(last(emaScores(ratios))).toBeGreaterThan(flat);
  });

  it('tek bir kaçırma kusursuz bir seriyi uçurmaz (yumuşatma korunuyor)', () => {
    const ratios = [...Array(40).fill(1), 0];
    expect(last(emaScores(ratios))).toBeGreaterThan(0.9);
  });
});

describe('#21 regresyonu — "henüz yoktu" ile "yapmadın" ayrışmalı', () => {
  // Çağıran (useHabitStats.buildSeries) kovaları alışkanlığın doğumundan
  // itibaren kestiği için, KUSURSUZ yeni bir alışkanlığın EMA'ya giren dizisi
  // yalnızca kendi yaşadığı günlerdir. Eski davranışta öne 80 sıfır eklenir ve
  // puan %51.6'ya düşerdi.
  it('10 günlük kusursuz alışkanlık %100 gösterir (eskiden %51.6 idi)', () => {
    expect(pct(last(emaScores(Array(10).fill(1))))).toBe(100);
  });

  it('hayalet sıfırlar eklenirse puan çöker — kesmenin neden şart olduğu', () => {
    const hayaletli = [...Array(80).fill(0), ...Array(10).fill(1)];
    expect(pct(last(emaScores(hayaletli)))).toBeLessThan(60);
  });

  it('kusursuz yeni alışkanlık, toparlanan eski alışkanlıktan AYIRT EDİLİR', () => {
    const yeniKusursuz = last(emaScores(Array(10).fill(1)));            // kesme sonrası
    const eskiToparlanan = last(emaScores([...Array(80).fill(0), ...Array(10).fill(1)]));
    expect(yeniKusursuz).toBeGreaterThan(eskiToparlanan + 0.3);
  });
});

describe('sabitler', () => {
  it('alpha yumuşatma aralığında', () => {
    expect(SCORE_EMA_ALPHA).toBeGreaterThan(0);
    expect(SCORE_EMA_ALPHA).toBeLessThan(1);
  });

  it('kilit eşiği en az bir haftalık veri ister', () => {
    expect(SCORE_MIN_DAYS).toBeGreaterThanOrEqual(7);
  });

  it('alpha parametrik geçilebilir (daha büyük alpha = daha çevik)', () => {
    const ratios = [...Array(20).fill(0), 1];
    expect(last(emaScores(ratios, 0.5))).toBeGreaterThan(last(emaScores(ratios, 0.07)));
  });
});
