// Pure form → database transforms for HabitForm. Bad or empty input never
// blocks saving; it falls back to a safe default.

import { todayDate } from '@/lib/helpers';
import type { HabitKind, Recurrence } from '@/db';

// The form's frequency modes; 'daily' = Recurrence null.
export type FreqMode = 'daily' | 'days' | 'interval' | 'quota';

export interface ScheduleInput {
  freqMode: FreqMode;
  weekdays: number[]; // selected days in 'days' mode (0=Sunday)
  everyNText: string; // "every how many days" in 'interval' mode
  quotaText: string; // "how many times per week" in 'quota' mode
  startDate: string | null; // for the 'interval' anchor (defaults to today)
  previousSchedule: Recurrence | null; // keeps the interval anchor when editing
}

// Falls back to every day (null) for no days, an interval < 2 or a quota outside 1–7.
export function buildSchedule(input: ScheduleInput): Recurrence | null {
  const { freqMode, weekdays, everyNText, quotaText, startDate, previousSchedule } = input;

  if (freqMode === 'days' && weekdays.length > 0) {
    return { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
  }

  if (freqMode === 'interval') {
    const n = parseInt(everyNText, 10);
    if (Number.isFinite(n) && n >= 2) {
      // Editing keeps the anchor so scheduled days don't shift; new = the start date.
      const anchor =
        previousSchedule?.freq === 'interval' && previousSchedule.anchor
          ? previousSchedule.anchor
          : (startDate ?? todayDate());
      return { freq: 'interval', every: n, anchor };
    }
    return null;
  }

  if (freqMode === 'quota') {
    const n = parseInt(quotaText, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 7) {
      return { freq: 'weekly', timesPerWeek: n };
    }
  }

  return null;
}

// numeric = amount + unit; timer = minutes typed, seconds stored; binary = nulls.
export function buildTarget(
  kind: HabitKind,
  targetText: string,
  unit: string
): { target_amount: number | null; unit: string | null } {
  const parsed = parseFloat(targetText.replace(',', '.'));
  if (kind === 'numeric') {
    const target_amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    return { target_amount, unit: target_amount != null && unit.trim() ? unit.trim() : null };
  }
  if (kind === 'timer') {
    return {
      target_amount: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : null,
      unit: null,
    };
  }
  return { target_amount: null, unit: null };
}

// "4 pages = 1 chapter" is typed as 4; goal_factor stores the inverse (0.25).
// Invalid input = 1.
export function ratioToGoalFactor(ratioText: string): number {
  const parsed = parseFloat(ratioText.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? 1 / parsed : 1;
}

// An end before the start becomes the start.
export function clampEndDate(startDate: string | null, endDate: string | null): string | null {
  return endDate && startDate && endDate < startDate ? startDate : endDate;
}
