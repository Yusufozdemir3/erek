import {
  groupByDay,
  groupEntries,
  shiftDay,
  splitRecent,
  type EntryLike,
} from '@/ui/goal/entryGroups';

// Local-time ISO builder (the grouping works on the LOCAL minute/day).
const at = (y: number, mo: number, d: number, h: number, mi: number, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString();

const entry = (id: string, amount: number, when: string, by: string | null = null): EntryLike => ({
  id,
  amount,
  updated_at: when,
  added_by: by,
});

describe('groupEntries', () => {
  it('aynı dakika + aynı kişi → tek satır, net toplam', () => {
    const out = groupEntries([
      entry('3', 1, at(2026, 10, 1, 14, 32, 50)),
      entry('2', 1, at(2026, 10, 1, 14, 32, 20)),
      entry('1', 1, at(2026, 10, 1, 14, 32, 5)),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(3);
    expect(out[0].count).toBe(3);
  });

  it('+5 sonra −1 aynı dakikada → net +4', () => {
    const out = groupEntries([
      entry('2', -1, at(2026, 10, 1, 9, 0, 40)),
      entry('1', 5, at(2026, 10, 1, 9, 0, 10)),
    ]);
    expect(out[0].amount).toBe(4);
    expect(out[0].count).toBe(2);
  });

  it('farklı dakika ayrı satır kalır', () => {
    const out = groupEntries([
      entry('2', 1, at(2026, 10, 1, 14, 33)),
      entry('1', 1, at(2026, 10, 1, 14, 32)),
    ]);
    expect(out).toHaveLength(2);
  });

  it('aynı dakikada iki farklı kişi ayrı satır kalır (kim ekledi bilgisi korunur)', () => {
    const out = groupEntries([
      entry('3', 2, at(2026, 10, 1, 14, 32, 50), 'ayse'),
      entry('2', 1, at(2026, 10, 1, 14, 32, 30), 'yusuf'),
      entry('1', 3, at(2026, 10, 1, 14, 32, 10), 'ayse'),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.addedBy === 'ayse')).toMatchObject({ amount: 5, count: 2 });
    expect(out.find((g) => g.addedBy === 'yusuf')).toMatchObject({ amount: 1, count: 1 });
  });

  it('en yeni girişin zamanını taşır', () => {
    const newest = at(2026, 10, 1, 14, 32, 55);
    const out = groupEntries([entry('2', 1, newest), entry('1', 1, at(2026, 10, 1, 14, 32, 1))]);
    expect(out[0].at).toBe(newest);
  });

  it('boş liste boş döner', () => {
    expect(groupEntries([])).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('günlere böler, sırayı korur', () => {
    const groups = groupEntries([
      entry('3', 1, at(2026, 10, 2, 8, 0)),
      entry('2', 1, at(2026, 10, 1, 20, 0)),
      entry('1', 1, at(2026, 10, 1, 7, 0)),
    ]);
    const days = groupByDay(groups);
    expect(days.map((d) => d.day)).toEqual(['2026-10-02', '2026-10-01']);
    expect(days[1].groups).toHaveLength(2);
  });
});

describe('splitRecent', () => {
  const build = (dates: [number, number][]) =>
    groupByDay(
      groupEntries(dates.map(([mo, d], i) => entry(String(i), 1, at(2026, mo, d, 12, 0))))
    );

  it('son 7 gün açık, gerisi katlı', () => {
    const days = build([
      [10, 2],
      [9, 30],
      [9, 20],
      [9, 1],
    ]);
    const { recent, older, olderEntryCount } = splitRecent(days, '2026-10-02');
    expect(recent.map((d) => d.day)).toEqual(['2026-10-02', '2026-09-30']);
    expect(older.map((d) => d.day)).toEqual(['2026-09-20', '2026-09-01']);
    expect(olderEntryCount).toBe(2);
  });

  it('hiç yeni giriş yoksa en yeni gün yine de görünür', () => {
    const days = build([
      [8, 5],
      [8, 1],
    ]);
    const { recent, older } = splitRecent(days, '2026-10-02');
    expect(recent.map((d) => d.day)).toEqual(['2026-08-05']);
    expect(older).toHaveLength(1);
  });

  it('7 günlük pencere bugünü de sayar (bugün + 6 gün öncesi)', () => {
    expect(shiftDay('2026-10-02', -6)).toBe('2026-09-26');
    const days = build([
      [9, 26],
      [9, 25],
    ]);
    const { recent, older } = splitRecent(days, '2026-10-02');
    expect(recent.map((d) => d.day)).toEqual(['2026-09-26']);
    expect(older.map((d) => d.day)).toEqual(['2026-09-25']);
  });
});
