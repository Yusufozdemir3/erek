// Small helpers shared by the repositories.

import * as Crypto from 'expo-crypto';
import type { Recurrence } from '../types/models';

// Generates a UUID on-device. Critical for IDs that don't collide even offline.
export function newId(): string {
  return Crypto.randomUUID();
}

// The current ISO 8601 timestamp. Used for updated_at.
export function nowIso(): string {
  return new Date().toISOString();
}

// Date -> "YYYY-MM-DD" (in the local timezone). The shared output format for
// date pickers; kept in one place so it isn't repeated separately across screens.
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Today's date in "YYYY-MM-DD" format (for habit logs).
// In the local timezone - whatever the user's "today" is.
export function todayDate(): string {
  return toYmd(new Date());
}

// Date -> "08:30" (hour:minute). The shared output format for time pickers.
export function toHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// "08:30" -> a Date set to that time today (the time picker's initial value).
// Returns the current time if null is given.
export function hmToDate(hm: string | null): Date {
  const d = new Date();
  if (hm) {
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

// Does a date-time string (like "YYYY-MM-DDTHH:MM...") have a time component?
// A task's due date can be time-less ("YYYY-MM-DD") or have a time; screens
// use this function to tell the two apart.
export function extractTime(value: string | null): string | null {
  if (!value || value.length < 16 || value[10] !== 'T') return null;
  return value.slice(11, 16);
}

// Seconds -> "M:SS", or "H:MM:SS" clock/stopwatch label if there are hours.
// Both the target and the progress are shown in this format for timer habits.
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
}

// Marker for a duration-tracked numeric goal — written into the Goal.unit
// field (not an actual unit label, but means "this goal's target/current_value
// is in SECONDS" — the goal-side counterpart of habit.kind='timer''s
// minutes→seconds pattern). NO migration/new column was NEEDED: unit is
// already a free-text TEXT field.
export const TIME_UNIT = '__time__';
export function isTimeUnit(unit: string | null | undefined): boolean {
  return unit === TIME_UNIT;
}

// List of "YYYY-MM-DD" for the last `count` days including today (oldest to
// today). Shared by the weekly history strip and the stats heatmap.
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

// SQLite accepts a limited number of bound parameters per query (32766 in
// modern versions, 999 in older ones). Since BATCH queries that build
// `IN (?, ?, …)` derive that count directly from the list length, the query
// blows up with a cryptic error once the list gets long enough — and that
// happens for exactly the person who uses the app the most. Splitting into
// chunks and merging the results takes the limit out of the equation entirely.
export const SQL_PARAM_CHUNK = 400;

export function chunk<T>(items: T[], size: number = SQL_PARAM_CHUNK): T[][] {
  if (items.length <= size) return items.length > 0 ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Safe parse/stringify for JSON fields (like recurrence).
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

// Display order: Monday to Sunday (JS getDay() values; not language-dependent).
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Is the given day within the habit's lifetime range? null start = since the
// beginning, null end = indefinite. Days outside the range are treated as
// "not scheduled": invisible, neither feeding nor breaking the streak. No
// need to convert to Date since "YYYY-MM-DD" string comparison is identical
// to chronological ordering.
export function isWithinHabitDates(
  start: string | null,
  end: string | null,
  dateYmd: string
): boolean {
  if (start && dateYmd < start) return false;
  if (end && dateYmd > end) return false;
  return true;
}

// The whole-day difference between two "YYYY-MM-DD" values (b - a; positive if b is later).
export function diffDays(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T00:00:00`);
  const b = new Date(`${bYmd}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// The Monday of the week containing the given day ("YYYY-MM-DD").
// Quota ("X times per week") calculations always treat the week as starting on Monday.
export function weekStartOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toYmd(d);
}

// Is this a weekly FLEXIBLE QUOTA rule ("X times per week", no days selected)?
// Under a quota rule, no single day is "due" on its own: the habit can be
// done any day, and success is measured by the weekly total (the streak is
// also counted on a weekly basis).
export function isQuotaSchedule(schedule: Recurrence | null): boolean {
  return (
    !!schedule &&
    schedule.freq === 'weekly' &&
    (schedule.weekdays?.length ?? 0) === 0 &&
    (schedule.timesPerWeek ?? 0) > 0
  );
}

// Is a recurrence rule valid on the given day ("YYYY-MM-DD")? null = every day.
// Determines whether the habit is "due/scheduled" that day (used for the
// streak + Today filter). A quota rule (X times per week) is considered
// "available" every day — evaluation is weekly.
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
    // CLAMP TO END OF MONTH: a user who picked "the 31st" got no scheduled day
    // at all in 30-day months and in February — the habit would disappear for
    // 5 months a year, silently losing the "every end of month" intent. A
    // selection beyond a month's last day falls back to that month's last day
    // (standard behavior in calendar apps).
    // THE COST (accepted deliberately): existing habits set to 29/30/31 now
    // have more scheduled days, so the streak breaks if those days aren't
    // checked off. The alternative — skipping the month entirely — would just
    // have continued the already-wrong behavior.
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(schedule.monthDay, lastDayOfMonth);
  }
  if (schedule.freq === 'interval') {
    const every = schedule.every ?? 0;
    if (every < 1 || !schedule.anchor) return true; // malformed rule — safe side: every day
    const diff = diffDays(schedule.anchor, dateYmd);
    return diff >= 0 && diff % every === 0;
  }
  if (schedule.freq === 'yearly') {
    return schedule.dates?.includes(dateYmd.slice(5)) ?? false;
  }
  return true;
}

// The NEXT date due_date is fast-forwarded to when a recurring task is
// completed. currentDue can be "YYYY-MM-DD" or timed "YYYY-MM-DDTHH:MM:SS";
// the time component (if any) is preserved. The first rule-matching day
// STRICTLY after both today and currentDue's day is chosen — an overdue task
// jumps to the next future slot rather than the past (days before today are
// never produced). Returns null if no matching day is found within 366 days
// (e.g. a weekly rule with no days selected); in that case the caller falls
// back to normal completion instead of fast-forwarding the task.
export function nextTaskOccurrence(
  recurrence: Recurrence,
  currentDue: string,
  today: string
): string | null {
  const timePart = currentDue.length > 10 ? currentDue.slice(10) : '';
  const dueYmd = currentDue.slice(0, 10);
  // For an overdue task, continue from today (hence tomorrow); for a task
  // completed early (due date in the future), move to after its own due day.
  const baseYmd = dueYmd > today ? dueYmd : today;
  const d = new Date(`${baseYmd}T00:00:00`);
  // Scans 4+ years: finds even the rarest day, like Feb 29 in a yearly rule.
  for (let i = 0; i < 1462; i++) {
    d.setDate(d.getDate() + 1);
    const ymd = toYmd(d);
    if (isScheduledOn(recurrence, ymd)) return `${ymd}${timePart}`;
  }
  return null;
}

// The language-dependent parts of scheduleLabel — produced by the caller via
// t() (see buildScheduleLabels). This module holds no translated text itself.
export interface ScheduleLabels {
  everyDay: string;
  dayNames: string[]; // JS getDay() order (0=Sunday ... 6=Saturday)
  everyNDays: (n: number) => string;   // "every 3 days"
  timesPerWeek: (n: number) => string; // "3 times a week"
  monthDay: (d: number) => string;     // "The 15th of every month"
  yearly: (dates: string) => string;   // "Every year: Feb 12, Jan 1"
  formatMonthDay: (md: string) => string; // "MM-DD" -> "Feb 12" (localized) or "12.02"
}

// Shared label factory: both the React side (useI18n().t) and the non-React
// side (translate(lang, ...)) can provide a translator with the same
// signature. If formatMonthDay isn't given, the non-localized "DD.MM" format is used.
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

// A short, readable label for the recurrence rule ("Every day" / "Mon·Wed·Fri" /
// "every 3 days" / "3 times a week" / "The 15th of every month" / "Every year: ...").
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
