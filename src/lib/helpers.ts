// Small helpers shared across the app.

import * as Crypto from 'expo-crypto';
import type { Recurrence } from '../types/models';

// On-device UUID, so records created offline never collide.
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

// Date -> "YYYY-MM-DD" in local time.
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The user's local "today" as "YYYY-MM-DD".
export function todayDate(): string {
  return toYmd(new Date());
}

// "YYYY-MM-DD" moved by n calendar days (local time, DST-safe).
export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

// Date -> "08:30".
export function toHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// "08:30" -> today at that time (now for null); a time picker's start value.
export function hmToDate(hm: string | null): Date {
  const d = new Date();
  if (hm) {
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

// The "HH:MM" of a "YYYY-MM-DDTHH:MM…" value, or null for a date-only one.
export function extractTime(value: string | null): string | null {
  if (!value || value.length < 16 || value[10] !== 'T') return null;
  return value.slice(11, 16);
}

// Seconds -> "M:SS", or "H:MM:SS" with hours.
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

// Stored in Goal.unit to mark a duration goal: its values are in SECONDS.
export const TIME_UNIT = '__time__';
export function isTimeUnit(unit: string | null | undefined): boolean {
  return unit === TIME_UNIT;
}

// The last `count` days including today, oldest first.
export function lastDays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    out.push(toYmd(day));
  }
  return out;
}

// SQLite limits bound parameters per query (999 on older versions), and an
// `IN (?, ?, …)` grows with the list: bulk queries run in chunks of this size.
export const SQL_PARAM_CHUNK = 400;

export function chunk<T>(items: T[], size: number = SQL_PARAM_CHUNK): T[][] {
  if (items.length <= size) return items.length > 0 ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Safe parse for JSON columns (like recurrence); null on bad input.
export function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

// Monday to Sunday, as JS getDay() values.
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Is the day within the habit's lifespan (null = unbounded) and not a rest
// day? Days outside count as unscheduled: no streak, rate or reminder effect.
// "YYYY-MM-DD" strings compare chronologically.
export function isWithinHabitDates(
  start: string | null,
  end: string | null,
  dateYmd: string,
  skips?: readonly string[] | null
): boolean {
  if (start && dateYmd < start) return false;
  if (end && dateYmd > end) return false;
  if (skips && skips.includes(dateYmd)) return false;
  return true;
}

// Whole days from a to b (positive if b is later).
export function diffDays(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T00:00:00`);
  const b = new Date(`${bYmd}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// The Monday of that day's week (weeks start on Monday).
export function weekStartOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toYmd(d);
}

// "X times a week" with no days picked: any day counts, success (and the
// streak) is measured per week.
export function isQuotaSchedule(schedule: Recurrence | null): boolean {
  return (
    !!schedule &&
    schedule.freq === 'weekly' &&
    (schedule.weekdays?.length ?? 0) === 0 &&
    (schedule.timesPerWeek ?? 0) > 0
  );
}

// Is the rule due on that day? null = every day; a quota rule is due every day.
export function isScheduledOn(schedule: Recurrence | null, dateYmd: string): boolean {
  if (!schedule || schedule.freq === 'daily') return true;
  if (schedule.freq === 'weekly') {
    if (isQuotaSchedule(schedule)) return true;
    const d = new Date(`${dateYmd}T00:00:00`);
    return schedule.weekdays?.includes(d.getDay()) ?? false;
  }
  if (schedule.freq === 'monthly') {
    if (!schedule.monthDay) return false;
    const d = new Date(`${dateYmd}T00:00:00`);
    // "The 31st" falls back to a shorter month's last day, like calendar apps;
    // skipping those months would hide the habit for 5 months a year.
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(schedule.monthDay, lastDayOfMonth);
  }
  if (schedule.freq === 'interval') {
    const every = schedule.every ?? 0;
    if (every < 1 || !schedule.anchor) return true; // malformed rule: every day
    const diff = diffDays(schedule.anchor, dateYmd);
    return diff >= 0 && diff % every === 0;
  }
  if (schedule.freq === 'yearly') {
    return schedule.dates?.includes(dateYmd.slice(5)) ?? false;
  }
  return true;
}

// Where a completed recurring task moves: the first matching day strictly after
// both today and its current due day, keeping any time of day. null when the
// rule never matches (the caller then completes it normally).
export function nextTaskOccurrence(
  recurrence: Recurrence,
  currentDue: string,
  today: string
): string | null {
  const timePart = currentDue.length > 10 ? currentDue.slice(10) : '';
  const dueYmd = currentDue.slice(0, 10);
  const baseYmd = dueYmd > today ? dueYmd : today;
  const d = new Date(`${baseYmd}T00:00:00`);
  // 4+ years, so even Feb 29 in a yearly rule is found.
  for (let i = 0; i < 1462; i++) {
    d.setDate(d.getDate() + 1);
    const ymd = toYmd(d);
    if (isScheduledOn(recurrence, ymd)) return `${ymd}${timePart}`;
  }
  return null;
}

// scheduleLabel's translated parts, built by the caller (buildScheduleLabels).
export interface ScheduleLabels {
  everyDay: string;
  dayNames: string[]; // JS getDay() order (0=Sunday ... 6=Saturday)
  everyNDays: (n: number) => string;   // "every 3 days"
  timesPerWeek: (n: number) => string; // "3 times a week"
  monthDay: (d: number) => string;     // "The 15th of every month"
  yearly: (dates: string) => string;   // "Every year: Feb 12, Jan 1"
  formatMonthDay: (md: string) => string; // "MM-DD" -> "Feb 12" (localized) or "12.02"
}

// Works with useI18n().t and translate(lang, …) alike. Without formatMonthDay, "DD.MM".
export function buildScheduleLabels(
  tr: (key: string, params?: Record<string, string | number>) => string,
  formatMonthDay?: (md: string) => string
): ScheduleLabels {
  const DAY_KEYS = [
    'weekday.sun', 'weekday.mon', 'weekday.tue', 'weekday.wed',
    'weekday.thu', 'weekday.fri', 'weekday.sat',
  ];
  return {
    everyDay: tr('habit.everyDay'),
    dayNames: DAY_KEYS.map((k) => tr(k)),
    everyNDays: (n) => tr('schedule.everyNDays', { n }),
    timesPerWeek: (n) => tr('schedule.timesPerWeek', { n }),
    monthDay: (d) => tr('schedule.monthDay', { d }),
    yearly: (dates) => tr('schedule.yearly', { dates }),
    formatMonthDay: formatMonthDay ?? ((md) => md.split('-').reverse().join('.')),
  };
}

// "Every day" / "Mon·Wed·Fri" / "every 3 days" / "3 times a week" / …
export function scheduleLabel(schedule: Recurrence | null, labels: ScheduleLabels): string {
  if (!schedule || schedule.freq === 'daily') return labels.everyDay;
  if (schedule.freq === 'weekly') {
    if (isQuotaSchedule(schedule)) return labels.timesPerWeek(schedule.timesPerWeek ?? 1);
    const wds = schedule.weekdays ?? [];
    if (wds.length === 0 || wds.length === 7) return labels.everyDay;
    return WEEKDAY_DISPLAY_ORDER.filter((w) => wds.includes(w))
      .map((w) => labels.dayNames[w])
      .join('·');
  }
  if (schedule.freq === 'monthly') return labels.monthDay(schedule.monthDay ?? 1);
  if (schedule.freq === 'interval') return labels.everyNDays(schedule.every ?? 1);
  if (schedule.freq === 'yearly') {
    const ds = [...(schedule.dates ?? [])].sort();
    if (ds.length === 0) return labels.everyDay;
    return labels.yearly(ds.map(labels.formatMonthDay).join(', '));
  }
  return labels.everyDay;
}
