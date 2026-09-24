// PURE transforms for HabitForm — computations from form state (text inputs,
// mode selections) to database fields. Used to be embedded inside
// src/ui/HabitForm.tsx's submit: buried in the middle of a 980-line component
// where no test could reach it (audit findings H1 + F1). Moved here because
// they have no React dependency (same rationale as lib/timerLogic.ts,
// lib/goalProjection.ts).
//
// SHARED RULE: invalid/empty input is NOT an error, it falls back to a safe
// default — the user is never blocked from saving just because they left a
// field half-filled.

import { todayDate } from '@/lib/helpers';
import type { HabitKind, Recurrence } from '@/db';

// The four frequency modes in the form. 'daily' = every day (corresponds to Recurrence null).
export type FreqMode = 'daily' | 'days' | 'interval' | 'quota';

export interface ScheduleInput {
  freqMode: FreqMode;
  weekdays: number[]; // selected days in 'days' mode (0=Sunday)
  everyNText: string; // "every how many days" in 'interval' mode
  quotaText: string; // "how many times per week" in 'quota' mode
  startDate: string | null; // for the 'interval' anchor (defaults to today)
  previousSchedule: Recurrence | null; // so the existing anchor is preserved when editing
}

// Converts the frequency mode to a Recurrence. Invalid/empty inputs fall back
// to "every day" (null): when no days are selected in the specific-days mode,
// when the interval number is < 2, or when the quota number is outside 1-7.
export function buildSchedule(input: ScheduleInput): Recurrence | null {
  const { freqMode, weekdays, everyNText, quotaText, startDate, previousSchedule } = input;

  if (freqMode === 'days' && weekdays.length > 0) {
    return { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
  }

  if (freqMode === 'interval') {
    const n = parseInt(everyNText, 10);
    if (Number.isFinite(n) && n >= 2) {
      // Anchor (reference day): when editing, the existing anchor is kept so
      // scheduled days don't shift; when creating, the anchor is the start
      // date (defaults to today).
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

// Depending on the target/unit type: numeric = amount+unit, timer = entered
// in MINUTES but stored in SECONDS (habit_logs.amount also accumulates in
// seconds), binary = both null.
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

// The user enters the ratio "how many {habit units} make one {goal unit}"
// (e.g. 4 pages = 1 chapter); the goal_factor stored in the DB is the INVERSE
// of this (0.25 — the actual multiplier to add to the goal). Invalid input
// falls back to 1 (one-to-one contribution).
export function ratioToGoalFactor(ratioText: string): number {
  const parsed = parseFloat(ratioText.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? 1 / parsed : 1;
}

// End date cannot precede the start date; if it does, it's pulled to the start date (single-day range).
export function clampEndDate(startDate: string | null, endDate: string | null): string | null {
  return endDate && startDate && endDate < startDate ? startDate : endDate;
}
