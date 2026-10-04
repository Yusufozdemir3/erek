// Grup hedef: katkı payı. Sıralama tablosu değil — sabit sıra, yüzdeler 100'e tamamlanır.

import { contributionShares, OWNER_KEY, wholePercents } from '../goalContributions';

const name = (k: string) => ({ ayse: 'Ayşe', can: 'Can', [OWNER_KEY]: 'Sen' } as Record<string, string>)[k] ?? k;

describe('wholePercents', () => {
  it('toplam her zaman 100', () => {
    expect(wholePercents([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([60, 40])).toEqual([60, 40]);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
  });
});

describe('contributionShares', () => {
  it('tek kişi katkı yaptıysa pay bölümü yok', () => {
    expect(contributionShares([{ amount: 5, added_by: null }, { amount: 3, added_by: null }], OWNER_KEY, name)).toEqual([]);
  });

  it('kendisi önce, diğerleri alfabetik — miktara göre DEĞİL', () => {
    const r = contributionShares(
      [
        { amount: 10, added_by: 'can' },
        { amount: 70, added_by: 'ayse' },
        { amount: 20, added_by: null },
      ],
      OWNER_KEY,
      name
    );
    expect(r.map((x) => x.key)).toEqual([OWNER_KEY, 'ayse', 'can']);
    expect(r.map((x) => x.share)).toEqual([20, 70, 10]);
  });

  it('düzeltme (eksi giriş) payı düşürür, sıfırın altına inmez ve 0 olan görünmez', () => {
    const r = contributionShares(
      [
        { amount: 10, added_by: 'ayse' },
        { amount: -4, added_by: 'ayse' },
        { amount: 6, added_by: null },
        { amount: -3, added_by: 'can' },
      ],
      OWNER_KEY,
      name
    );
    expect(r.map((x) => [x.key, x.amount])).toEqual([[OWNER_KEY, 6], ['ayse', 6]]);
    expect(r.map((x) => x.share)).toEqual([50, 50]);
  });

  it('paylaşılan ekranda "ben" kendi uid\'idir', () => {
    const r = contributionShares([{ amount: 5, added_by: 'can' }, { amount: 5, added_by: 'ayse' }], 'can', name);
    expect(r[0].key).toBe('can');
  });
});
