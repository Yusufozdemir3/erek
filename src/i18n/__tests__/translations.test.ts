// Dictionary integrity: every key in all three languages (a missing one
// silently falls back to Turkish in the English UI), plus plural siblings.

import { LANG_LABELS, SUPPORTED_LANGS, translate, translations } from '../translations';

const keysOf = (lang: 'tr' | 'en' | 'de') => Object.keys(translations[lang]).sort();

describe('sözlük bütünlüğü', () => {
  it('üç dil de tanımlı ve dolu', () => {
    expect(SUPPORTED_LANGS).toEqual(['tr', 'en', 'de']);
    for (const lang of SUPPORTED_LANGS) {
      expect(Object.keys(translations[lang]).length).toBeGreaterThan(100);
    }
  });

  it('İngilizce sözlükte eksik anahtar YOK (Türkçe referans)', () => {
    expect(keysOf('tr').filter((k) => !(k in translations.en))).toEqual([]);
  });

  it('Almanca sözlükte eksik anahtar YOK (Türkçe referans)', () => {
    expect(keysOf('tr').filter((k) => !(k in translations.de))).toEqual([]);
  });

  it('Türkçe\'de olmayan FAZLA anahtar yok (ölü çeviri)', () => {
    for (const lang of ['en', 'de'] as const) {
      expect(keysOf(lang).filter((k) => !(k in translations.tr))).toEqual([]);
    }
  });

  it('hiçbir dilde boş metin yok', () => {
    for (const lang of SUPPORTED_LANGS) {
      const blanks = Object.entries(translations[lang])
        .filter(([, v]) => v.trim() === '')
        .map(([k]) => k);
      expect(blanks).toEqual([]);
    }
  });

  it('her dilin bir görünen adı var', () => {
    for (const lang of SUPPORTED_LANGS) expect(LANG_LABELS[lang]).toBeTruthy();
  });
});

describe('translate', () => {
  it('{param} yer tutucularını doldurur', () => {
    const out = translate('tr', 'goalStats.verdictNeed', { amount: '5 sayfa' });
    expect(out).toContain('5 sayfa');
    expect(out).not.toContain('{amount}');
  });

  it('aynı parametre birden çok geçerse hepsini doldurur', () => {
    expect(translate('tr', 'olmayan.anahtar.{n}.{n}', { n: 1 })).toBe('olmayan.anahtar.1.1');
  });

  it('bilinmeyen anahtarda anahtarın KENDİSİNİ döndürür (boş metin değil)', () => {
    expect(translate('en', 'kesinlikle.olmayan.anahtar')).toBe('kesinlikle.olmayan.anahtar');
  });
});

// `<key>_one` for n === 1 ("1 day left", not "1 days left").
describe('translate — tekil biçim (çoğullaştırma)', () => {
  it('n=1 iken _one biçimini kullanır', () => {
    expect(translate('en', 'date.daysLeft', { n: 1 })).toBe('1 day left');
    expect(translate('de', 'date.daysAgo', { n: 1 })).toBe('Vor 1 Tag');
  });

  it('n≠1 iken anahtarın kendisi (çoğul) kullanılır', () => {
    expect(translate('en', 'date.daysLeft', { n: 3 })).toBe('3 days left');
    expect(translate('de', 'date.daysAgo', { n: 0 })).toBe('Vor 0 Tagen');
  });

  it('Türkçe\'de tekil ve çoğul aynı sonucu verir (dil çoğul eki almaz)', () => {
    expect(translate('tr', 'date.daysLeft', { n: 1 })).toBe('1 gün kaldı');
    expect(translate('tr', 'date.daysLeft', { n: 5 })).toBe('5 gün kaldı');
  });

  it('_one karşılığı olmayan anahtar n=1 ile de çalışır (çoğula düşer)', () => {
    // 'schedule.timesPerWeek' doesn't need a singular form; it should silently fall back to the base key.
    expect(translate('en', 'schedule.timesPerWeek', { n: 1 })).toBe('1× a week');
  });

  it('n parametresi yoksa tekil arama HİÇ yapılmaz', () => {
    expect(translate('en', 'date.daysLeft')).toBe('{n} days left');
  });

  // A singular form must exist in all three languages.
  it('her _one anahtarının çoğul karşılığı da var', () => {
    for (const lang of SUPPORTED_LANGS) {
      const orphans = Object.keys(translations[lang])
        .filter((k) => k.endsWith('_one'))
        .filter((k) => !(k.slice(0, -'_one'.length) in translations[lang]));
      expect(orphans).toEqual([]);
    }
  });
});
