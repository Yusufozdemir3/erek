// Pure streak rules (shared by habitRepo and a friend's shared habit). The
// repo-level streak tests in habitRepo.test.ts pin the same behavior through
// SQLite; these pin it without a database.

import { currentStreakFrom, longestStreakFrom } from '../streaks';

const TODAY = '2026-07-01'; // Wednesday
const daily = { schedule: null, start_date: null, end_date: null };
const monWedFri = {
  schedule: { freq: 'weekly' as const, weekdays: [1, 3, 5] },
  start_date: null,
  end_date: null,
};
const quota3 = {
  schedule: { freq: 'weekly' as const, weekdays: [], timesPerWeek: 3 },
  start_date: null,
  end_date: null,
};

describe('currentStreakFrom', () => {
  it('bugün işaretsizken seri kırılmaz', () => {
    expect(currentStreakFrom(daily, ['2026-06-29', '2026-06-30'], TODAY)).toBe(2);
  });

  it('planlı bir günü kaçırmak seriyi keser', () => {
    expect(currentStreakFrom(daily, ['2026-06-28', TODAY], TODAY)).toBe(1);
  });

  it('plansız gündeki boşluk seriyi kesmez', () => {
    // Fri 26, Mon 29, Wed 1 — Tue/Sat/Sun unscheduled.
    expect(currentStreakFrom(monWedFri, ['2026-06-26', '2026-06-29', TODAY], TODAY)).toBe(3);
  });

  it('kota: hedefi tutan ardışık haftaları sayar, bu hafta henüz eksikse kırmaz', () => {
    const lastWeek = ['2026-06-22', '2026-06-23', '2026-06-24'];
    const weekBefore = ['2026-06-15', '2026-06-16', '2026-06-17'];
    expect(currentStreakFrom(quota3, [...lastWeek, ...weekBefore, TODAY], TODAY)).toBe(2);
  });

  it('kayıt yoksa 0', () => {
    expect(currentStreakFrom(daily, [], TODAY)).toBe(0);
  });
});

describe('longestStreakFrom', () => {
  it('geçmişteki en uzun seriyi bulur, sıralanmamış girdiyi kabul eder', () => {
    const dates = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-20', '2026-06-21'];
    expect(longestStreakFrom(daily, [...dates].reverse(), TODAY)).toBe(3);
  });

  it('yaşam aralığı dışındaki günler seriyi etkilemez', () => {
    const ranged = { schedule: null, start_date: '2026-06-29', end_date: null };
    expect(longestStreakFrom(ranged, ['2026-06-20', '2026-06-29', '2026-06-30'], TODAY)).toBe(2);
  });
});
