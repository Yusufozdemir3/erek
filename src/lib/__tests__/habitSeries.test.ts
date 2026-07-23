// buildSeries (puan grafiğinin veri üretimi) testleri.
//
// Kilitlenen kural (kullanıcı kararı 2026-07-23): grafik SADECE devamlılığı
// gösterir — üç alışkanlık tipinde de tek soru vardır, "o gün tamamlandı mı?".
// Puan 0'dan başlar, adım adım yükselir, adım adım düşer; plansız gün nötrdür.

import { buildSeries } from '@/lib/habitSeries';
import type { Habit, HabitLog } from '@/db';
import { lastDays, todayDate } from '@/lib/helpers';

const baseHabit: Habit = {
  id: 'h1',
  user_id: 'u1',
  goal_id: null,
  title: 'Test',
  kind: 'binary',
  remind_at: null,
  icon: null,
  color: null,
  schedule: null, // her gün
  target_amount: null,
  unit: null,
  start_date: null,
  end_date: null,
  goal_contribution: null,
  goal_factor: 1,
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  synced: 1,
};

// completedDates'teki günler tamamlanmış, diğer günler kaçırılmış sayılır.
function logsFor(days: string[], completedDates: Set<string>, amount = 0): HabitLog[] {
  return days.map((d, i) => ({
    id: `log-${i}`,
    habit_id: 'h1',
    log_date: d,
    completed: completedDates.has(d) ? 1 : 0,
    amount: completedDates.has(d) ? amount : 0,
    updated_at: `${d}T12:00:00.000Z`,
  }));
}

const dayScores = (h: Habit, logs: HabitLog[]) =>
  (buildSeries(h, logs)?.day ?? []).map((b) => b.score);

describe('buildSeries — puan 0\'dan başlar, adım adım gider', () => {
  it('kusursuz gidişte her gün bir öncekinden yüksek (adım adım yükselir)', () => {
    const days = lastDays(20);
    const scores = dayScores(baseHabit, logsFor(days, new Set(days)));
    expect(scores.length).toBeGreaterThan(1);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it('ilk gün tavana fırlamaz — sıfırdan başlar', () => {
    const days = lastDays(20);
    const scores = dayScores(baseHabit, logsFor(days, new Set(days)));
    expect(scores[0]).toBeLessThan(0.2);
  });

  it('kaçırılan günlerde adım adım düşer', () => {
    const days = lastDays(30);
    const completed = new Set(days.slice(0, 20)); // ilk 20 gün yapıldı, son 10 kaçtı
    const scores = dayScores(baseHabit, logsFor(days, completed));
    const tail = scores.slice(-10);
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i]).toBeLessThan(tail[i - 1]);
    }
  });
});

describe('buildSeries — üç alışkanlık tipi AYNI çalışır', () => {
  // Aynı tamamlanma deseni -> aynı puan. Nicel/zamanlayıcıda kısmi kredi YOK:
  // gün ya tamamlandı (completed=1) ya tamamlanmadı.
  it('ikili / nicel / zamanlayıcı aynı deseni aynı puanla gösterir', () => {
    const days = lastDays(15);
    const completed = new Set(days.filter((_, i) => i % 3 !== 0));

    const binary = dayScores(baseHabit, logsFor(days, completed));
    const numeric = dayScores(
      { ...baseHabit, kind: 'numeric', target_amount: 8, unit: 'bardak' },
      logsFor(days, completed, 8)
    );
    const timer = dayScores(
      { ...baseHabit, kind: 'timer', target_amount: 1800 },
      logsFor(days, completed, 1800)
    );

    expect(numeric).toEqual(binary);
    expect(timer).toEqual(binary);
  });

  it('hedefin altında kalan nicel gün TAMAMLANMADI sayılır (kısmi kredi yok)', () => {
    const days = lastDays(15);
    const numeric: Habit = { ...baseHabit, kind: 'numeric', target_amount: 8, unit: 'bardak' };

    // Her gün 5/8 içilmiş: completed=0, amount=5 -> puan hiç yükselmemeli.
    const yarim = days.map((d, i) => ({
      id: `l${i}`,
      habit_id: 'h1',
      log_date: d,
      completed: 0 as const,
      amount: 5,
      updated_at: `${d}T12:00:00.000Z`,
    }));

    const scores = dayScores(numeric, yarim);
    expect(Math.max(...scores)).toBe(0);
  });
});

describe('buildSeries — plansız gün nötr, çizgi kesintisiz', () => {
  const mwf: Habit = {
    ...baseHabit,
    schedule: { freq: 'weekly', weekdays: [1, 3, 5] }, // Pzt/Çar/Cum
  };

  it('plansız günler kova olarak KALIR (süreklilik korunur)', () => {
    const days = lastDays(21);
    const series = buildSeries(mwf, logsFor(days, new Set(days)));
    // Kovalar günlük akmaya devam eder — plansız günler diziden atılmaz.
    expect(series!.day.length).toBeGreaterThan(10);
    expect(series!.day.some((b) => b.ratio === null)).toBe(true);
  });

  it('plansız gün puanı DÜŞÜRMEZ (bir öncekiyle aynı kalır)', () => {
    const days = lastDays(21);
    const series = buildSeries(mwf, logsFor(days, new Set(days)))!;
    series.day.forEach((b, i) => {
      if (i > 0 && b.ratio === null) expect(b.score).toBe(series.day[i - 1].score);
    });
  });

  it('haftada 3 gün planlı ve hiç kaçırılmamışsa puan yükselmeye devam eder', () => {
    const days = lastDays(60);
    const series = buildSeries(mwf, logsFor(days, new Set(days)))!;
    const son = series.day[series.day.length - 1].score;
    // Eski davranışta (plansız gün = kaçırıldı) bu değer %42,7 civarında kalıyordu.
    expect(son).toBeGreaterThan(0.6);
  });
});

describe('buildSeries — sınır durumlar', () => {
  it('hiç log yoksa null döner', () => {
    expect(buildSeries(baseHabit, [])).toBeNull();
  });

  it('tek günlük veri de seri üretir (kilit yok)', () => {
    const today = todayDate();
    const series = buildSeries(baseHabit, logsFor([today], new Set([today])));
    expect(series).not.toBeNull();
    expect(series!.day.length).toBeGreaterThan(0);
  });
});
