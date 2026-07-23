// goalProjection testleri.
//
// MODEL (kullanıcı kararı 2026-07-23): başlangıç ve son tarih ZORUNLU olduğu
// için tüm hesaplar o eksende yapılır:
//   • avgDaily   = mevcut / yaşanan gün (kayan 7/30 pencere DEĞİL)
//   • last7Total = son 7 günün girdi toplamı (soru pencereli olduğu için)
//   • projectedFinishDate  = bugün + kalan/avgDaily
//   • projectedAtDeadline  = mevcut + avgDaily × kalan gün (son tarih geçtiyse: mevcut)
//   • behindAmount         = hedef − projectedAtDeadline

import { goalProjection, type GoalEntryLike } from '../goalProjection';

const TODAY = '2026-07-16';
const entry = (amount: number, day: string): GoalEntryLike => ({
  amount,
  updated_at: `${day}T10:00:00.000Z`,
});

describe('goalProjection — yaşanan gün ekseni', () => {
  it('bugün açılan hedefte yaşanan gün 1\'dir (bugün dahil)', () => {
    // Sabit 7'ye bölünseydi 3/7≈0.43 çıkardı — oysa gerçek hız 3/gün.
    const p = goalProjection({
      entries: [entry(1, TODAY), entry(1, TODAY), entry(1, TODAY)],
      target: 21,
      current: 3,
      remaining: 18,
      daysLeft: 22,
      completed: false,
      today: TODAY,
      startDate: TODAY,
    });
    expect(p.daysElapsed).toBe(1);
    expect(p.last7Total).toBe(3);
    expect(p.avgDaily).toBeCloseTo(3);
  });

  it('avgDaily girdilerden DEĞİL mevcut değer / yaşanan günden hesaplanır', () => {
    // 10 gün önce başladı (bugün dahil 11 gün), mevcut 55 -> 5/gün.
    // Girdi geçmişi eksik olsa bile (yalnız 1 satır) hız doğru çıkar.
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 55,
      remaining: 145,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.daysElapsed).toBe(11);
    expect(p.avgDaily).toBeCloseTo(5);
    expect(p.last7Total).toBe(10); // "son 7 günde ne kadar yaptım" ayrı soru
  });

  it('negatif düzeltme temposu SIFIRLAMAZ (eski hata: kartlar kaybolurdu)', () => {
    // Kullanıcı yanlış girdiği 20'yi geri almış: son 7 günün neti negatif.
    const p = goalProjection({
      entries: [entry(-20, TODAY), entry(30, '2026-07-14')],
      target: 200,
      current: 50,
      remaining: 150,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.last7Total).toBe(10); // -20 + 30
    expect(p.avgDaily).toBeCloseTo(50 / 11); // mevcut/yaşanan gün — negatiften etkilenmez
    expect(p.projectedFinishDate).not.toBeNull();
  });

  it('startDate yoksa (eski hedef) en eski girdinin gününe düşülür', () => {
    const p = goalProjection({
      entries: [entry(3, TODAY)],
      target: 21,
      current: 3,
      remaining: 18,
      daysLeft: 22,
      completed: false,
      today: TODAY,
    });
    expect(p.daysElapsed).toBe(1);
    expect(p.avgDaily).toBeCloseTo(3);
  });

  it('ne başlangıç ne girdi varsa hiçbir şey hesaplanmaz', () => {
    const p = goalProjection({
      entries: [],
      target: 200,
      current: 0,
      remaining: 200,
      daysLeft: 15,
      completed: false,
      today: TODAY,
    });
    expect(p.avgDaily).toBeNull();
    expect(p.daysElapsed).toBeNull();
    expect(p.projectedFinishDate).toBeNull();
  });

  it('hiç ilerleme yoksa hız null (bitiş tahmini de yok)', () => {
    const p = goalProjection({
      entries: [],
      target: 200,
      current: 0,
      remaining: 200,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.avgDaily).toBeNull();
    expect(p.projectedFinishDate).toBeNull();
    expect(p.daysElapsed).toBe(11); // yaşanan gün yine bilinir
  });
});

describe('goalProjection — projeksiyonlar', () => {
  it('yavaş tempo son tarihi kaçırıyorsa "açık" (behind > 0)', () => {
    // 11 gündür açık, 55/200 -> 5/gün. 15 gün sonra 55+75=130 -> 70 açık.
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 55,
      remaining: 145,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedAtDeadline).toBeCloseTo(130);
    expect(p.behindAmount).toBeCloseTo(70);
    expect(p.projectedFinishDate! > '2026-07-31').toBe(true); // son tarihten sonra
  });

  it('hızlı tempo hedefi aşacaksa "fazla" (behind < 0)', () => {
    // 11 gündür açık, 110/100... değil: 11 gün, mevcut 55, hedef 100 -> 5/gün,
    // 10 gün sonra 105 -> hedefi 5 aşar.
    const p = goalProjection({
      entries: [entry(20, '2026-07-15')],
      target: 100,
      current: 55,
      remaining: 45,
      daysLeft: 10,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.avgDaily).toBeCloseTo(5);
    expect(p.projectedAtDeadline).toBeCloseTo(105);
    expect(p.behindAmount).toBeCloseTo(-5);
  });

  it('SON TARİH GEÇTİYSE tahmin değil GERÇEKLEŞEN gösterilir (kart kaybolmaz)', () => {
    const p = goalProjection({
      entries: [entry(10, '2026-07-10')],
      target: 200,
      current: 120,
      remaining: 80,
      daysLeft: -5, // son tarih 5 gün önceydi
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedAtDeadline).toBe(120); // o gün elindeki
    expect(p.behindAmount).toBeCloseTo(80); // kalan miktar = açık
  });

  it('tamamlanmış hedefte bitiş tahmini üretilmez', () => {
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 200,
      remaining: 0,
      daysLeft: 5,
      completed: true,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedFinishDate).toBeNull();
    expect(p.avgDaily).not.toBeNull(); // hız yine gösterilebilir
    // İleri uzatma YOK: addProgress hedefte kırptığı için "fazla yaparsın" yanlış olurdu.
    expect(p.projectedAtDeadline).toBe(200);
    expect(p.behindAmount).toBe(0);
  });

  it('son tarih yoksa bitiş tahmini var ama açık yok', () => {
    const p = goalProjection({
      entries: [entry(14, '2026-07-15')],
      target: 200,
      current: 100,
      remaining: 100,
      daysLeft: null,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.projectedFinishDate).not.toBeNull();
    expect(p.projectedAtDeadline).toBeNull();
    expect(p.behindAmount).toBeNull();
  });

  it('çok yavaş hızda saçma/geçersiz tarih üretmez (10 yıl sınırı)', () => {
    // 100 gündür açık, mevcut 1 -> 0.01/gün. Kalan 9999 -> ~1 milyon gün.
    const p = goalProjection({
      entries: [entry(1, '2026-04-07')],
      target: 10000,
      current: 1,
      remaining: 9999,
      daysLeft: 30,
      completed: false,
      today: TODAY,
      startDate: '2026-04-07',
    });
    expect(p.avgDaily).toBeGreaterThan(0);
    expect(p.projectedFinishDate).toBeNull(); // "bu hızla bitmez"
  });
});

describe('goalProjection — son 7 gün', () => {
  it('pencere yaşanan günü aşamaz (2 günlük hedefte 2 günün toplamı)', () => {
    const p = goalProjection({
      entries: [entry(5, TODAY), entry(4, '2026-07-15'), entry(99, '2026-07-01')],
      target: 100,
      current: 9,
      remaining: 91,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-07-15',
    });
    expect(p.daysElapsed).toBe(2);
    expect(p.last7Total).toBe(9); // 2 günlük pencere: eski 99 girmez
  });

  it('7 günden eski girdiler toplama girmez', () => {
    const p = goalProjection({
      entries: [entry(5, TODAY), entry(50, '2026-07-01')],
      target: 100,
      current: 55,
      remaining: 45,
      daysLeft: 20,
      completed: false,
      today: TODAY,
      startDate: '2026-06-16',
    });
    expect(p.last7Total).toBe(5);
  });
});
