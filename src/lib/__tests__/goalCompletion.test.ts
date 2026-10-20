// completionSummary: the recap numbers of a finished goal.

import { completionSummary, type CompletionInput } from '../goalCompletion';

const base: CompletionInput = {
  startDate: '2026-10-01',
  completedAt: '2026-10-10T12:00:00',
  deadline: '2026-10-15',
  isNumeric: true,
  currentValue: 120,
  targetValue: 100,
  entries: [
    { amount: 30, updated_at: '2026-10-02T09:00:00.000Z' },
    { amount: 20, updated_at: '2026-10-02T18:00:00.000Z' },
    { amount: 60, updated_at: '2026-10-05T09:00:00.000Z' },
    { amount: -10, updated_at: '2026-10-06T09:00:00.000Z' }, // correction
    { amount: 20, updated_at: '2026-10-10T09:00:00.000Z' },
  ],
  milestonesDone: 0,
  milestonesTotal: 0,
  today: '2026-10-18',
};

describe('completionSummary', () => {
  it('süre tamamlanma gününe kadar sayılır (bugüne değil) ve iki uç dahildir', () => {
    const s = completionSummary(base);
    expect(s.endDay).toBe('2026-10-10');
    expect(s.durationDays).toBe(10);
    // Frozen: the same goal read a week later gives the same average.
    expect(completionSummary({ ...base, today: '2026-10-25' }).avgDaily).toBe(s.avgDaily);
    expect(s.avgDaily).toBeCloseTo(12);
  });

  it('hedefi aşma oranı, en iyi gün ve aktif gün sayısı', () => {
    const s = completionSummary(base);
    expect(s.total).toBe(120);
    expect(s.overTarget).toBeCloseTo(1.2);
    expect(s.bestDay).toEqual({ day: '2026-10-05', amount: 60 });
    expect(s.activeDays).toBe(3); // the correction day doesn't count
    expect(s.entryCount).toBe(4);
  });

  it('son tarihe göre erken / zamanında / geç', () => {
    expect(completionSummary(base).deadlineGap).toBe(5);
    expect(completionSummary({ ...base, deadline: '2026-10-10' }).deadlineGap).toBe(0);
    expect(completionSummary({ ...base, deadline: '2026-10-07' }).deadlineGap).toBe(-3);
    expect(completionSummary({ ...base, deadline: null }).deadlineGap).toBeNull();
  });

  it('başlangıç yoksa ilk girdiyi, o da yoksa bitiş gününü alır; ters tarih tek güne iner', () => {
    expect(completionSummary({ ...base, startDate: null }).startDay).toBe('2026-10-02');
    const empty = completionSummary({ ...base, startDate: null, entries: [] });
    expect(empty.startDay).toBe('2026-10-10');
    expect(empty.durationDays).toBe(1);
    expect(completionSummary({ ...base, startDate: '2026-11-01' }).durationDays).toBe(1);
  });

  it('tamamlanma anı yoksa bugün bitmiş sayılır', () => {
    expect(completionSummary({ ...base, completedAt: null }).endDay).toBe('2026-10-18');
  });

  it('adımlı hedefte sayısal alanlar boş, adım sayıları dolu', () => {
    const s = completionSummary({ ...base, isNumeric: false, milestonesDone: 4, milestonesTotal: 4 });
    expect(s).toMatchObject({ total: null, avgDaily: null, bestDay: null, milestonesDone: 4, milestonesTotal: 4 });
    expect(s.durationDays).toBe(10);
  });
});
