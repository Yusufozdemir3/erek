// Haftalık özet: oran, trend, tam günler, en iyi / ilgi isteyen alışkanlık, kota alışkanlığı.

import { buildReview, isReviewDay, reviewWeekKey, type ReviewHabit } from '../weeklyReview';

const TODAY = '2026-10-07'; // Çarşamba
const day = (offset: number) => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daily = (id: string, title = id, over: Partial<ReviewHabit> = {}): ReviewHabit => ({
  id,
  title,
  schedule: null,
  start_date: null,
  end_date: null,
  ...over,
});
const marks = (...offsets: number[]) => new Set(offsets.map(day));
const run = (habits: ReviewHabit[], completed: Record<string, Set<string>> = {}, taskDoneDates: string[] = []) =>
  buildReview({ habits, completed, taskDoneDates, today: TODAY });

describe('oran ve günler', () => {
  it('her gün planlı alışkanlık: yapılan/7', () => {
    const r = run([daily('a')], { a: marks(0, -1, -2, -3) });
    expect(r.rate).toBe(57); // 4/7
    expect(r.days).toHaveLength(7);
    expect(r.days[6]).toEqual({ date: TODAY, scheduled: 1, done: 1 });
    expect(r.days[0].date).toBe(day(-6));
    expect(r.perfectDays).toBe(4);
  });

  it('hiç alışkanlık ya da planlı gün yoksa oran null', () => {
    expect(run([]).rate).toBeNull();
    const noDays = daily('w', 'w', { schedule: { freq: 'weekly', weekdays: [] } as never });
    expect(run([noDays]).rate).toBeNull();
  });

  it('seçili günlerde planlı alışkanlık yalnız o günleri sayar', () => {
    // Pazartesi(1) ve Çarşamba(3): penceredeki 7 günde bir Pazartesi, bir Çarşamba
    const h = daily('mw', 'mw', { schedule: { freq: 'weekly', weekdays: [1, 3] } as never });
    const r = run([h], { mw: marks(0) });
    expect(r.habits[0].expected).toBe(2);
    expect(r.rate).toBe(50);
  });

  it('ömür aralığı dışındaki günler sayılmaz', () => {
    const r = run([daily('n', 'n', { start_date: day(-3) })], { n: marks(0, -1, -2, -3) });
    expect(r.habits[0].expected).toBe(4);
    expect(r.rate).toBe(100);
  });
});

describe('kota alışkanlığı (haftada 3)', () => {
  const quota = daily('q', 'q', { schedule: { freq: 'weekly', weekdays: [], timesPerWeek: 3 } as never });

  it('hedefi aşmak oranı şişirmez, dinlenme günü cezalandırılmaz', () => {
    expect(run([quota], { q: marks(0, -1, -2, -3, -4) }).habits[0]).toMatchObject({ expected: 3, done: 3, rate: 100 });
    expect(run([quota], { q: marks(0, -3) }).rate).toBe(67);
  });

  it('günlük tam gün hesabına karışmaz', () => {
    const r = run([quota], { q: marks(0) });
    expect(r.days.every((d) => d.scheduled === 0)).toBe(true);
    expect(r.perfectDays).toBe(0);
  });
});

describe('trend', () => {
  it('önceki 7 günle karşılaştırır (puan farkı)', () => {
    const r = run([daily('a')], { a: new Set([...marks(0, -1, -2, -3, -4, -5, -6), ...marks(-7, -8, -9)]) });
    expect(r.rate).toBe(100);
    expect(r.prevRate).toBe(43); // 3/7
    expect(r.delta).toBe(57);
  });

  it('önceki hafta alışkanlık yoksa delta null', () => {
    const r = run([daily('a', 'a', { start_date: day(-2) })]);
    expect(r.prevRate).toBeNull();
    expect(r.delta).toBeNull();
  });
});

describe('sıralama', () => {
  it('en iyi ve ilgi isteyen: en az 3 beklenen gün ister, farklı alışkanlıklar', () => {
    const r = run([daily('iyi', 'İyi'), daily('orta', 'Orta'), daily('kotu', 'Kötü')], {
      iyi: marks(0, -1, -2, -3, -4, -5, -6),
      orta: marks(0, -1, -2),
      kotu: marks(0),
    });
    expect(r.best?.id).toBe('iyi');
    expect(r.needsAttention?.id).toBe('kotu');
    expect(r.habits.map((h) => h.id)).toEqual(['iyi', 'orta', 'kotu']);
  });

  it('herkes %100 ise ilgi isteyen yok; hiç yapılmayan "en iyi" olmaz', () => {
    const full = marks(0, -1, -2, -3, -4, -5, -6);
    expect(run([daily('a'), daily('b')], { a: full, b: full }).needsAttention).toBeNull();
    const none = run([daily('a')]);
    expect(none.best).toBeNull();
    expect(none.rate).toBe(0);
  });

  it('tek alışkanlık hem en iyi hem ilgi isteyen olamaz', () => {
    const r = run([daily('a')], { a: marks(0, -1, -2, -3) });
    expect(r.best?.id).toBe('a');
    expect(r.needsAttention).toBeNull();
  });

  it('3 günden az beklenen alışkanlık sıralamaya girmez ama oranı etkiler', () => {
    const r = run([daily('yeni', 'Yeni', { start_date: day(-1) })], { yeni: marks(0) });
    expect(r.best).toBeNull();
    expect(r.rate).toBe(50);
  });
});

describe('görevler', () => {
  it('yalnız pencere içindeki tamamlanan görevleri sayar, orana karışmaz', () => {
    const r = run([], {}, [day(0), day(-6), day(-7), day(-30)]);
    expect(r.tasksDone).toBe(2);
    expect(r.rate).toBeNull();
  });
});

describe('Pazar/Pazartesi hatırlatması', () => {
  it('yalnız Pazar ve Pazartesi', () => {
    expect(isReviewDay('2026-10-04')).toBe(true); // Pazar
    expect(isReviewDay('2026-10-05')).toBe(true); // Pazartesi
    expect(isReviewDay('2026-10-06')).toBe(false);
    expect(isReviewDay('2026-10-10')).toBe(false);
  });

  it('hafta anahtarı: Pazartesi başlangıçlı; Pazar o haftanın sonunda', () => {
    expect(reviewWeekKey('2026-10-05')).toBe('2026-10-05');
    expect(reviewWeekKey('2026-10-07')).toBe('2026-10-05');
    expect(reviewWeekKey('2026-10-11')).toBe('2026-10-05'); // Pazar
    expect(reviewWeekKey('2026-10-12')).toBe('2026-10-12');
  });
});

describe('mola günü', () => {
  it('mola yapılan gün beklenen sayılmaz: oran düşmez', () => {
    // 7 günde 4 yapıldı, 3 gün mola → 4/4
    const r = run([daily('a', 'a', { skip_dates: [day(-4), day(-5), day(-6)] })], { a: marks(0, -1, -2, -3) });
    expect(r.rate).toBe(100);
    expect(r.days[0].scheduled).toBe(0);
    expect(r.perfectDays).toBe(4);
  });
});
