// goalProjection testleri — kullanıcının bildirdiği tutarsızlıkları kilitler:
//  1) Son tarihi kaçıran yavaş tempoda "önde" DEĞİL "açık" (behindAmount > 0).
//  2) avgDaily "Son 7 gün" toplamıyla tutarlı (last7Total / pencere).
//  3) Pencere hedefin GERÇEKTEN yaşadığı gün sayısıyla sınırlı — bugün açılıp
//     bugün girdi eklenen bir hedefte sabit 7'ye bölmek hızı yapay küçültüyordu
//     (kullanıcı bunu "3 ders girdim ama 0.4 pace diyor" diye bildirdi).

import { goalProjection, type GoalEntryLike } from '../goalProjection';

const TODAY = '2026-07-16';
const entry = (amount: number, day: string): GoalEntryLike => ({
  amount,
  updated_at: `${day}T10:00:00.000Z`,
});

describe('goalProjection', () => {
  it('girdi yoksa her şey null', () => {
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
    expect(p.behindAmount).toBeNull();
    expect(p.projectedFinishDate).toBeNull();
  });

  it('BUGÜN açılan hedefte pencere 7 değil GERÇEK gün sayısıyla sınırlı (kullanıcının bildirdiği hata)', () => {
    // Hedef bugün başladı (start_date=bugün), bugün 3 ders girildi. Sabit 7'ye
    // bölünseydi 3/7≈0.4 çıkardı — oysa gerçek hız 3/gün (henüz 1 günün var).
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
    expect(p.daysElapsed).toBe(0);
    expect(p.last7Total).toBe(3);
    expect(p.avgDaily).toBeCloseTo(3); // 3/1, DEĞİL 3/7≈0.43
  });

  it('startDate verilmezse eski hedeflerde en eski girdinin tarihine düşülür', () => {
    const p = goalProjection({
      entries: [entry(3, TODAY)],
      target: 21,
      current: 3,
      remaining: 18,
      daysLeft: 22,
      completed: false,
      today: TODAY,
      // startDate YOK — geriye uyum yolu.
    });
    expect(p.daysElapsed).toBe(0);
    expect(p.avgDaily).toBeCloseTo(3);
  });

  it('hedef 7+ gündür açıkken avgDaily tam 7 günün ortalamasıdır ve last7Total ile tutarlıdır', () => {
    // Hedef 10 gün önce başladı (pencere doluyor), dün 10 sayfa girildi.
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 112,
      remaining: 88,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.last7Total).toBe(10);
    expect(p.avgDaily).toBeCloseTo(10 / 7);
    expect(p.avgDaily! * 7).toBeCloseTo(p.last7Total!);
    expect(p.daysElapsed).toBe(10);
  });

  it('yavaş tempo son tarihi kaçırıyorsa "açık" (behind > 0), ASLA önde değil', () => {
    // Kullanıcının senaryosu: 112/200, 15 gün kalmış, son 7 günde yalnız 10 sayfa,
    // hedef 10 gündür açık (pencere dolu, 10/7 hızı).
    const p = goalProjection({
      entries: [entry(10, '2026-07-15')],
      target: 200,
      current: 112,
      remaining: 88,
      daysLeft: 15,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    // Bu hızla son tarihte ~133 sayfada olur → 200'ün ~67 altında.
    expect(p.projectedAtDeadline).toBeCloseTo(112 + (10 / 7) * 15);
    expect(p.behindAmount).toBeGreaterThan(0); // AÇIK — eski hata negatif (önde) üretiyordu
    expect(p.behindAmount).toBeCloseTo(200 - (112 + (10 / 7) * 15));
    // Tahmini bitiş son tarihten (15 gün) çok sonra.
    expect(p.projectedFinishDate! > '2026-07-31').toBe(true);
  });

  it('hızlı tempo hedefi aşacaksa "fazla" (behind < 0)', () => {
    // 50/100, 10 gün kalmış, hedef 10 gündür açık, son 7 günde 70 sayfa → 10/gün → son tarihte 150.
    const p = goalProjection({
      entries: [entry(70, '2026-07-15')],
      target: 100,
      current: 50,
      remaining: 50,
      daysLeft: 10,
      completed: false,
      today: TODAY,
      startDate: '2026-07-06',
    });
    expect(p.avgDaily).toBeCloseTo(10);
    expect(p.projectedAtDeadline).toBeCloseTo(150);
    expect(p.behindAmount).toBeCloseTo(-50); // FAZLA
  });

  it('tamamlanmış hedefte projeksiyon üretilmez', () => {
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
    expect(p.behindAmount).toBeNull();
    // Tempo yine de gösterilebilir (avgDaily doludur), ama açık/bitiş yok.
    expect(p.avgDaily).toBeCloseTo(10 / 7);
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

  it('bu hafta girdi yoksa son 30 güne düşer (hedef 30+ gündür açıkken tam pencere)', () => {
    // 20 gün önce 30 sayfa, son 7 günde hiç, hedef 40 gündür açık (30 günlük
    // pencere dolu) → avgDaily = 30/30 = 1.
    const p = goalProjection({
      entries: [entry(30, '2026-06-26')],
      target: 200,
      current: 30,
      remaining: 170,
      daysLeft: 40,
      completed: false,
      today: TODAY,
      startDate: '2026-06-06',
    });
    expect(p.last7Total).toBe(0);
    expect(p.avgDaily).toBeCloseTo(1);
  });

  it('30 günlük pencere de hedefin gerçek yaşıyla sınırlı', () => {
    // Hedef 20 gün önce başladı (30'dan az) → pencere 30 değil 20 (startDate→today dahil 20+1=21, min(30,21)=21).
    const p = goalProjection({
      entries: [entry(30, '2026-06-26')],
      target: 200,
      current: 30,
      remaining: 170,
      daysLeft: 40,
      completed: false,
      today: TODAY,
      startDate: '2026-06-26', // hedef ilk girdiyle aynı gün başladı, bugüne 20 gün
    });
    expect(p.last7Total).toBe(0);
    expect(p.avgDaily).toBeCloseTo(30 / 21);
  });
});
