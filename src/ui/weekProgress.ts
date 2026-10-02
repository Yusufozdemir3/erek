// Per-day completion for the "Today" week strip's little status dots.
// A day counts habits scheduled that day (within their lifespan) plus tasks
// due that day; the strip only needs "none / some / all done", not exact numbers.

import { habitRepo, taskRepo } from '@/db';
import { isScheduledOn, isWithinHabitDates, toYmd } from '@/lib/helpers';

export type DayProgress = { done: number; total: number };
export type WeekProgress = Record<string, DayProgress>;

const WINDOW_RADIUS = 3; // keep in step with WeekStrip

function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toYmd(d);
}

export function computeWeekProgress(userId: string, selectedDate: string, today: string): WeekProgress {
  const allHabits = habitRepo.listByUser(userId);
  const out: WeekProgress = {};
  for (let i = -WINDOW_RADIUS; i <= WINDOW_RADIUS; i++) {
    const ymd = addDays(selectedDate, i);
    const scheduled = allHabits.filter(
      (h) => isScheduledOn(h.schedule, ymd) && isWithinHabitDates(h.start_date, h.end_date, ymd)
    );
    const states = habitRepo.getDayStates(
      scheduled.map((h) => h.id),
      ymd
    );
    // Same rule as the list below it: today also carries over unfinished tasks.
    const tasks =
      ymd === today ? taskRepo.listForToday(userId, ymd) : taskRepo.listByDueDate(userId, ymd);
    const done =
      scheduled.filter((h) => states[h.id]?.completed).length +
      tasks.filter((t) => t.completed_at !== null).length;
    out[ymd] = { done, total: scheduled.length + tasks.length };
  }
  return out;
}
