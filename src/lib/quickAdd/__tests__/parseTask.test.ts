// Ayrıştırıcının dile bağlı olmayan sözleşmesi: güvenilmez girdiye
// dayanıklılık, sınırlar, determinizm.

import { MAX_INPUT_CHARS, parseTask } from '../parseTask';

const NOW = new Date(2026, 9, 7, 14, 0);

describe('parseTask — girdi', () => {
  it('boş ve yalnız boşluk girdi boş sonuç verir', () => {
    for (const text of ['', '   ', '\n\t']) {
      expect(parseTask(text, 'tr', NOW)).toEqual({ title: '', date: null, time: null, priority: null, remind: false });
    }
  });

  it('yalnız noktalama boş başlık verir', () => {
    expect(parseTask('... !!! ,,,', 'en', NOW).title).toBe('');
  });

  it(`girdi ${MAX_INPUT_CHARS} karakterde kesilir`, () => {
    const long = 'kelime '.repeat(500);
    expect(parseTask(long, 'tr', NOW).title.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
  });

  it('kesimden sonra gelen tarih görmezden gelinir', () => {
    const text = `${'a '.repeat(MAX_INPUT_CHARS)}yarın`;
    expect(parseTask(text, 'tr', NOW).date).toBeNull();
  });

  it('patolojik girdide takılmaz', () => {
    const inputs = ["3'".repeat(200), 'saat '.repeat(100), ':'.repeat(400), '1:1'.repeat(150), 'a'.repeat(5000)];
    const started = Date.now();
    for (const text of inputs) for (const lang of ['tr', 'en', 'de'] as const) parseTask(text, lang, NOW);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('aynı girdi aynı sonucu verir', () => {
    const text = "yarın akşam 7'de annemi ara";
    expect(parseTask(text, 'tr', NOW)).toEqual(parseTask(text, 'tr', NOW));
  });

  it('başlıktaki iç noktalama korunur, uçtaki atılır', () => {
    expect(parseTask('süt, ekmek, yumurta al.', 'tr', NOW).title).toBe('Süt, ekmek, yumurta al');
  });

  it('büyük harfli girdide de çalışır (Türkçe İ/I)', () => {
    expect(parseTask("YARIN SAAT 3'TE İLACINI İÇ", 'tr', NOW)).toEqual({
      title: 'İLACINI İÇ',
      date: '2026-10-08',
      time: '15:00',
      priority: null,
      remind: false,
    });
  });

  it('dile özel kurallar diğer dilde uygulanmaz', () => {
    expect(parseTask('yarın süt al', 'en', NOW)).toEqual({
      title: 'Yarın süt al',
      date: null,
      time: null,
      priority: null,
      remind: false,
    });
  });
});

describe('parseTask — takvim', () => {
  it('ay sonunu doğru aşar', () => {
    const endOfMonth = new Date(2026, 9, 30, 10, 0); // 30 Ekim
    expect(parseTask('3 gün sonra', 'tr', endOfMonth).date).toBe('2026-11-02');
  });

  it('yıl sonunu doğru aşar', () => {
    const endOfYear = new Date(2026, 11, 31, 10, 0);
    expect(parseTask('yarın', 'tr', endOfYear).date).toBe('2027-01-01');
    expect(parseTask('ayın 5\'inde', 'tr', endOfYear).date).toBe('2027-01-05');
  });

  it('pazar günü "haftaya pazartesi" ertesi gündür (hafta pazartesi başlar)', () => {
    const sunday = new Date(2026, 9, 11, 10, 0);
    expect(parseTask('haftaya pazartesi', 'tr', sunday).date).toBe('2026-10-12');
  });

  it('29 Şubat yalnız artık yılda', () => {
    const jan2027 = new Date(2027, 0, 10, 10, 0); // 2027 artık değil, 2028 artık
    expect(parseTask("29 Şubat'ta", 'tr', jan2027)).toMatchObject({ title: "29 Şubat'ta", date: null });
    const jan2028 = new Date(2028, 0, 10, 10, 0);
    expect(parseTask("29 Şubat'ta", 'tr', jan2028).date).toBe('2028-02-29');
  });
});
