import { matchesWords, queryWords, MAX_QUERY_LEN } from '../search';
import { fold } from '../textFold';

describe('fold', () => {
  it('küçük harf ve aksan farkı yok sayılır', () => {
    expect(fold('Alışveriş ÇIKIŞ İstanbul', 'tr')).toBe('alisveris cikis istanbul');
    expect(fold('Größe ÄÖÜ', 'de')).toBe('grosse aou');
    expect(fold("Don't", 'en')).toBe('dont');
  });
});

describe('arama', () => {
  const find = (title: string, q: string, lang: 'tr' | 'en' | 'de' = 'tr') => matchesWords(title, queryWords(q, lang), lang);

  it('kelime parçası, aksansız ve büyük/küçük harfsiz bulur', () => {
    expect(find('Alışveriş yap', 'alis')).toBe(true);
    expect(find('Alışveriş yap', 'ALIŞ')).toBe(true);
    expect(find('Annemi ara', 'ISTANBUL')).toBe(false);
  });

  it('tüm kelimeler gerekir, sıra önemli değil', () => {
    expect(find('Süt ve ekmek al', 'ekmek süt')).toBe(true);
    expect(find('Süt ve ekmek al', 'süt peynir')).toBe(false);
  });

  it('boş sorgu her şeyi eşler', () => {
    expect(find('Her şey', '')).toBe(true);
    expect(find('Her şey', '   ')).toBe(true);
    expect(queryWords('  ', 'tr')).toEqual([]);
  });

  it('çok uzun sorgu kesilir', () => {
    expect(queryWords('a'.repeat(5000), 'en')[0].length).toBe(MAX_QUERY_LEN);
  });

  it('Almanca ß ve Umlaut', () => {
    expect(find('Straße fegen', 'strasse', 'de')).toBe(true);
    expect(find('Äpfel kaufen', 'apfel', 'de')).toBe(true);
  });
});
