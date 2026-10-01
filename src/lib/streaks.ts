// Streak computation as pure functions over a habit's completed dates, so the
// same rules serve both the local database (habitRepo) and a friend's shared
// habit fetched from the server (src/sync/sharedHabits.ts). The rules:
//   - Only scheduled days inside the habit's lifespan (start/end) count; a gap
//     on an unscheduled/out-of-range day never breaks a streak.
//   - Current streak: today not yet marked doesn't break it.
//   - QUOTA ("X times a week") habits count consecutive WEEKS that met the
//     quota; the unfinished current week neither breaks nor counts.

import type { Habit } from '../types/models';
import { isQuotaSchedule, isScheduledOn, isWithinHabitDates, toYmd, weekStartOf } from './helpers';

export type StreakHabit = Pick<Habit, 'schedule' | 'start_date' | 'end_date'> | null;

export function weekCompletionCounts(dates: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const ws = weekStartOf(d);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }
  return counts;
}

export function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toYmd(d);
}

function isDueFn(habit: StreakHabit) {
  return (d: string) =>
    isScheduledOn(habit?.schedule ?? null, d) &&
    isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
}

export function currentStreakFrom(habit: StreakHabit, completedDates: Iterable<string>, today: string): number {
  const completed = new Set(completedDates);
  if (completed.size === 0) return 0;

  if (isQuotaSchedule(habit?.schedule ?? null)) {
    const quota = habit!.schedule!.timesPerWeek!;
    const counts = weekCompletionCounts(completed);
    let cursor = weekStartOf(today);
    let streak = 0;
    if ((counts.get(cursor) ?? 0) >= quota) streak++;
    cursor = shiftWeek(cursor, -1);
    while ((counts.get(cursor) ?? 0) >= quota) {
      streak++;
      cursor = shiftWeek(cursor, -1);
    }
    return streak;
  }

  const isDue = isDueFn(habit);
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00`);
  // ~2+ years upper bound (generous for sparse weekly schedules).
  for (let i = 0; i < 800; i++) {
    const dateStr = toYmd(cursor);
    if (isDue(dateStr)) {
      if (completed.has(dateStr)) streak++;
      else if (dateStr !== today) break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function longestStreakFrom(habit: StreakHabit, completedDates: Iterable<string>, today: string): number {
  const sorted = [...new Set(completedDates)].sort();
  if (sorted.length === 0) return 0;

  if (isQuotaSchedule(habit?.schedule ?? null)) {
    const quota = habit!.schedule!.timesPerWeek!;
    const counts = weekCompletionCounts(sorted);
    const currentWeek = weekStartOf(today);
    let cursor = weekStartOf(sorted[0]);
    let run = 0;
    let best = 0;
    while (cursor <= currentWeek) {
      if ((counts.get(cursor) ?? 0) >= quota) {
        run++;
        if (run > best) best = run;
      } else if (cursor !== currentWeek) {
        run = 0;
      }
      cursor = shiftWeek(cursor, 1);
    }
    return best;
  }

  const isDue = isDueFn(habit);
  const completed = new Set(sorted);
  let run = 0;
  let best = 0;
  const cursor = new Date(`${sorted[0]}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  while (cursor <= end) {
    const dateStr = toYmd(cursor);
    if (isDue(dateStr)) {
      if (completed.has(dateStr)) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return best;
}
