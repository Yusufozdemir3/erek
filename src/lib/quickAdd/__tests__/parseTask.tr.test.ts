// Türkçe ayrıştırıcı sözleşmesi. Referans an: Çarşamba 7 Ekim 2026, 14:00.
// Her satır: söylenen cümle -> forma dolacak alanlar. Belirtilmeyen alan
// boş (null / false) beklenir.

import { parseTask, type ParsedTask } from '../parseTask';

const NOW = new Date(2026, 9, 7, 14, 0);

const exp = (o: Partial<ParsedTask>): ParsedTask => ({
  title: '',
  date: null,
  time: null,
  priority: null,
  remind: false,
  ...o,
});

const cases: [string, Partial<ParsedTask>][] = [
  // tarih + saat
  ["yarın saat 3'te annemi ara", { title: 'Annemi ara', date: '2026-10-08', time: '15:00' }],
  ["annemi yarın akşam 7'de ara", { title: 'Annemi ara', date: '2026-10-08', time: '19:00' }],
  ["yarın sabah 9'da dişçi randevusu", { title: 'Dişçi randevusu', date: '2026-10-08', time: '09:00' }],
  ['bu akşam çöpü çıkar', { title: 'Çöpü çıkar', date: '2026-10-07', time: '19:00' }],
  ["saat 15:30'da toplantı", { title: 'Toplantı', date: '2026-10-07', time: '15:30' }],
  ["saat 15.30'da toplantı", { title: 'Toplantı', date: '2026-10-07', time: '15:30' }],
  ['saat üç buçukta toplantı', { title: 'Toplantı', date: '2026-10-07', time: '15:30' }],
  ['dörde çeyrek kala otobüse bin', { title: 'Otobüse bin', date: '2026-10-07', time: '15:45' }],
  ["3'ü çeyrek geçe ilaç", { title: 'İlaç', date: '2026-10-07', time: '15:15' }],
  ["akşam 6'ya kadar raporu bitir", { title: 'Raporu bitir', date: '2026-10-07', time: '18:00' }],
  ['saat on beşte', { date: '2026-10-07', time: '15:00' }],
  ["3’te kahve", { title: 'Kahve', date: '2026-10-07', time: '15:00' }], // kıvrık kesme işareti
  ["yarın saat 3'te", { date: '2026-10-08', time: '15:00' }],

  // gün adları
  ['haftaya salı sunum hazırla', { title: 'Sunum hazırla', date: '2026-10-13' }],
  ['haftaya çarşamba', { date: '2026-10-14' }],
  ['bu cuma market', { title: 'Market', date: '2026-10-09' }],
  ['cumaya kadar raporu bitir', { title: 'Raporu bitir', date: '2026-10-09' }],
  ['cuma akşamı sinema', { title: 'Sinema', date: '2026-10-09', time: '19:00' }],
  ["cuma 3'te toplantı", { title: 'Toplantı', date: '2026-10-09', time: '15:00' }],
  ['pazar günü pazara git', { title: 'Pazara git', date: '2026-10-11' }],
  ['çarşamba', { date: '2026-10-07' }], // bugün çarşamba -> bugün

  // göreli
  ['3 gün sonra faturayı öde', { title: 'Faturayı öde', date: '2026-10-10' }],
  ['iki gün sonra', { date: '2026-10-09' }],
  ['bir hafta sonra', { date: '2026-10-14' }],
  ['1 saat sonra çamaşırları as', { title: 'Çamaşırları as', date: '2026-10-07', time: '15:00' }],
  ['yarım saat sonra fırını kapat', { title: 'Fırını kapat', date: '2026-10-07', time: '14:30' }],
  ['bir buçuk saat sonra', { date: '2026-10-07', time: '15:30' }],
  ['öbür gün', { date: '2026-10-09' }],
  ['yarından sonra spor', { title: 'Spor', date: '2026-10-09' }],
  ['gelecek hafta', { date: '2026-10-14' }],

  // ay günü
  ["15 Ekim'de doğum günü hediyesi al", { title: 'Doğum günü hediyesi al', date: '2026-10-15' }],
  ['15 ekimde', { date: '2026-10-15' }],
  ["ayın 20'sinde kirayı öde", { title: 'Kirayı öde', date: '2026-10-20' }],
  ["ayın 5'inde", { date: '2026-11-05' }], // bu ayın 5'i geçti -> gelecek ay
  ["5 Ekim'de", { date: '2027-10-05' }], // bu yılın 5 Ekim'i geçti -> gelecek yıl

  // öncelik
  ['faturayı öde acil', { title: 'Faturayı öde', priority: 'high' }],
  ['sunumu bitir çok önemli', { title: 'Sunumu bitir', priority: 'high' }],
  ['acil olarak faturayı öde', { title: 'Faturayı öde', priority: 'high' }],
  ['acilen faturayı öde', { title: 'Faturayı öde', priority: 'high' }],
  ['yüksek öncelikli rapor yaz', { title: 'Rapor yaz', priority: 'high' }],
  ['düşük öncelikli kitap oku', { title: 'Kitap oku', priority: 'low' }],
  ['önceliği orta mail at', { title: 'Mail at', priority: 'medium' }],

  // hatırlatma ve dil bilgisi
  [
    "yarın 9'da bana annemi aramayı hatırlat",
    { title: 'Annemi ara', date: '2026-10-08', time: '09:00', remind: true },
  ],
  [
    "ilacımı almamı hatırlat akşam 8'de",
    { title: 'İlacımı al', date: '2026-10-07', time: '20:00', remind: true },
  ],
  ['faturayı ödemeyi unutma', { title: 'Faturayı öde', remind: true }],
  ["hatırlatma kur yarın 10'da su iç", { title: 'Su iç', date: '2026-10-08', time: '10:00', remind: true }],
  ['bana yarın kitabı getirmeyi hatırlatır mısın', { title: 'Kitabı getir', date: '2026-10-08', remind: true }],

  // dolgu
  ['lütfen yarın süt al', { title: 'Süt al', date: '2026-10-08' }],
  ['görev ekle yarın süt al', { title: 'Süt al', date: '2026-10-08' }],
  ['yeni bir görev ekle ekmek al', { title: 'Ekmek al' }],
];

describe('parseTask (tr)', () => {
  it.each(cases)('%s', (text, expected) => {
    expect(parseTask(text, 'tr', NOW)).toEqual(exp(expected));
  });
});

describe('parseTask (tr) — muhafazakâr kurallar', () => {
  it('çıplak sayı saat değildir', () => {
    expect(parseTask('3 ekmek al', 'tr', NOW)).toEqual(exp({ title: '3 ekmek al' }));
  });

  it('başlıktaki sayı kalır, saat ayrıca bulunur', () => {
    expect(parseTask("2 kilo elma al saat 5'te", 'tr', NOW)).toEqual(
      exp({ title: '2 kilo elma al', date: '2026-10-07', time: '17:00' })
    );
  });

  it('"saat" tek başına isimdir (kol saati)', () => {
    expect(parseTask('saat al', 'tr', NOW)).toEqual(exp({ title: 'Saat al' }));
  });

  it('"pazar" pazar yeri de demek: belirteçsiz tarih sayılmaz', () => {
    expect(parseTask('pazara git', 'tr', NOW)).toEqual(exp({ title: 'Pazara git' }));
    expect(parseTask('pazar alışverişi', 'tr', NOW)).toEqual(exp({ title: 'Pazar alışverişi' }));
  });

  it('"cuma namazı": tarih cuma olur ama kelime başlıkta kalır', () => {
    expect(parseTask('cuma namazı', 'tr', NOW)).toEqual(exp({ title: 'Cuma namazı', date: '2026-10-09' }));
  });

  it('emin olunan tarih, emin olunmayanı yener', () => {
    expect(parseTask('cuma raporunu yarın gönder', 'tr', NOW)).toEqual(
      exp({ title: 'Cuma raporunu gönder', date: '2026-10-08' })
    );
  });

  it('"akşam yemeği" bir isimdir', () => {
    expect(parseTask('akşam yemeği hazırla', 'tr', NOW)).toEqual(exp({ title: 'Akşam yemeği hazırla' }));
    expect(parseTask('sabah koşusu', 'tr', NOW)).toEqual(exp({ title: 'Sabah koşusu' }));
  });

  it('tarihle birlikte "akşam yemeği": saat dolar, kelime kalır', () => {
    expect(parseTask('yarın akşam yemeği hazırla', 'tr', NOW)).toEqual(
      exp({ title: 'Akşam yemeği hazırla', date: '2026-10-08', time: '19:00' })
    );
    expect(parseTask('bu akşam yemeği hazırla', 'tr', NOW)).toEqual(
      exp({ title: 'Akşam yemeği hazırla', date: '2026-10-07', time: '19:00' })
    );
  });

  it('başta "acil" ismin parçası olabilir: öncelik dolar, kelime kalır', () => {
    expect(parseTask('acil durum çantası hazırla', 'tr', NOW)).toEqual(
      exp({ title: 'Acil durum çantası hazırla', priority: 'high' })
    );
  });

  it('olmayan tarih (31 Şubat) başlıkta kalır', () => {
    expect(parseTask("31 Şubat'ta", 'tr', NOW)).toEqual(exp({ title: "31 Şubat'ta" }));
  });

  it('"ona kadar" tek başına saat değildir', () => {
    expect(parseTask('ona kadar say', 'tr', NOW)).toEqual(exp({ title: 'Ona kadar say' }));
  });
});

describe('parseTask (tr) — belirsiz saatler', () => {
  it('1-6 arası öğleden sonradır', () => {
    expect(parseTask("5'te spor", 'tr', NOW).time).toBe('17:00');
  });

  it("7-11 arası: bugün saatin bir sonraki gösterimi (14:00'te 9 -> 21:00)", () => {
    expect(parseTask("saat 9'da spor", 'tr', NOW)).toEqual(exp({ title: 'Spor', date: '2026-10-07', time: '21:00' }));
  });

  it("7-11 arası: sabahsa sabah (08:00'de 9 -> 09:00)", () => {
    const morning = new Date(2026, 9, 7, 8, 0);
    expect(parseTask("saat 9'da spor", 'tr', morning).time).toBe('09:00');
  });

  it('başka bir günde 7-11 sabahtır', () => {
    expect(parseTask("yarın 10'da toplantı", 'tr', NOW).time).toBe('10:00');
  });

  it('günü söylenmemiş saat geçtiyse yarına kayar', () => {
    const evening = new Date(2026, 9, 7, 20, 0);
    expect(parseTask("saat 3'te toplantı", 'tr', evening)).toEqual(
      exp({ title: 'Toplantı', date: '2026-10-08', time: '15:00' })
    );
  });

  it('"bugün" denmişse geçmiş saat de bugün kalır', () => {
    const evening = new Date(2026, 9, 7, 20, 0);
    expect(parseTask("bugün saat 3'te toplantı", 'tr', evening).date).toBe('2026-10-07');
  });

  it('gece 2 = 02:00, geçtiyse yarın', () => {
    expect(parseTask("gece 2'de ilacını iç", 'tr', NOW)).toEqual(
      exp({ title: 'İlacını iç', date: '2026-10-08', time: '02:00' })
    );
  });

  it('öğlen 1 = 13:00', () => {
    expect(parseTask("öğlen 1'de yemek", 'tr', NOW).time).toBe('13:00');
  });

  it('tek başına "öğlen" 12:00; geçtiyse yarın', () => {
    expect(parseTask('öğlen markete uğra', 'tr', NOW)).toEqual(
      exp({ title: 'Markete uğra', date: '2026-10-08', time: '12:00' })
    );
  });

  it('"09:30" sıfırla başlıyorsa sabahtır', () => {
    const evening = new Date(2026, 9, 7, 20, 0);
    expect(parseTask("saat 09:30'da", 'tr', evening)).toEqual(exp({ date: '2026-10-08', time: '09:30' }));
  });

  it('göreli saat gece yarısını geçebilir', () => {
    const late = new Date(2026, 9, 7, 22, 0);
    expect(parseTask('3 saat sonra', 'tr', late)).toEqual(exp({ date: '2026-10-08', time: '01:00' }));
  });
});
