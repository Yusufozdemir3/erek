// Pure formatters and period constants for the habit stats screen.

import { fmtClock } from '@/lib/helpers';
import type { Habit } from '@/db';
import { DATE_LOCALE } from '@/i18n/dateLocale';
import type { Lang } from '@/i18n/translations';

// 5, 5.5 — no trailing decimals.
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// 24500 -> "24.5k", 1_600_000 -> "1.6M".
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return fmtAmount(n);
}

// Goal-period values: time for timers, amount + unit for numeric, days for binary.
export function fmtGoalValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return `${fmtCompact(n)}${habit.unit ? ` ${habit.unit}` : ''}`;
}

// A History bar's value: like fmtGoalValue but without the unit (narrow columns).
export function fmtHistoryValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return fmtCompact(n);
}

// The Score and History tabs.
export type ChartPeriod = 'day' | 'week' | 'month';

export const PERIOD_OPTIONS: { key: ChartPeriod; labelKey: string }[] = [
  { key: 'day', labelKey: 'stats.periodDay' },
  { key: 'week', labelKey: 'stats.periodWeek' },
  { key: 'month', labelKey: 'stats.periodMonth' },
];
export const PERIOD_UNIT_KEY: Record<ChartPeriod, string> = {
  day: 'stats.unitDay',
  week: 'stats.unitWeek',
  month: 'stats.unitMonth',
};

// A History bar's label: the month name for months; for days and weeks the
// day number, with the month name where a new month starts ("JUN·22·29·JUL·13").
export function historyBarLabel(
  period: ChartPeriod,
  bucketStart: string,
  prevBucketStart: string | null,
  lang: Lang
): string {
  const d = new Date(`${bucketStart}T00:00:00`);
  if (period === 'month') {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  if (!prevBucketStart || d.getMonth() !== new Date(`${prevBucketStart}T00:00:00`).getMonth()) {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  return String(d.getDate());
}

// Dark or light text for a value inside a bar of the habit's color (BT.601 brightness).
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#0a0a0a';
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0a0a0a' : '#ffffff';
}
