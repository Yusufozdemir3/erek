// Pure formatters and period constants for the habit stats screen — SPLIT OUT
// of app/habit/[id].tsx (audit finding H1). Since they don't depend on React,
// they can be tested directly in the fast 'logic' test project.

import { fmtClock } from '@/lib/helpers';
import type { Habit } from '@/db';
import { DATE_LOCALE } from '@/i18n/dateLocale';
import type { Lang } from '@/i18n/translations';

// No decimals for whole numbers (5, 5.5) — same rule as fmt in AmountStepper.
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Abbreviates large amounts (24500 -> "24.5k", 1_600_000 -> "1.6M") — because
// Week/Month/Year goal totals can quickly reach the thousands/millions (step counts, etc.).
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return fmtAmount(n);
}

// Formats a value (done/goal) on the goal-period card based on habit type:
// hours for timer, amount+unit for numeric, plain day count for binary.
export function fmtGoalValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return `${fmtCompact(n)}${habit.unit ? ` ${habit.unit}` : ''}`;
}

// Formats the value shown in a "History" bar — the SAME type distinction as
// fmtGoalValue (hours for timer, amount for numeric) but does NOT add the
// unit (looked overly cramped in narrow columns, see the HistoryBars
// comment). Timer habits used to go through fmtCompact too — the seconds
// total turned into a meaningless number like "5.4k" (user feedback).
export function fmtHistoryValue(habit: Habit, n: number): string {
  if (habit.target_amount == null) return String(Math.round(n));
  if (habit.kind === 'timer') return fmtClock(n);
  return fmtCompact(n);
}

// Day/Week/Month period — used by both the Score and History sections
// (since the dayRatio-based series is already available, see useHabitStats.HabitChartSeries).
export type ChartPeriod = 'day' | 'week' | 'month';

// Day/Week/Month selector — both the Score and History cards use the same
// three-way period pattern (single source, consistent text/order).
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

// "Goal + Score + History" — a FAITHFUL port of the mockup approved in
// Claude Design (Round 9, card 9a): a single dark card, thin dividers between
// sections. Colors are the mockup's own palette (background #0a0a0a, border
// #262626, secondary text #666/#999) — the ONE deliberate difference: the
// accent color, fixed teal (#5eead4) in the mockup, is `color` (the habit's
// own color) here — left dynamic so it stays consistent with the rest of the
// app (icon, other charts).
// "Score" — the EMA (exponential moving average) score; the calculation,
// including the WARM-UP window, is now done inside useHabitStats.buildSeries
// (see emaScores/attachScores in that file) — only the ready-made b.score is
// read here.

// "History" bar label: depends on period — always the month name in the
// month bucket, the month name on the first bar that crosses into a new
// month in the week bucket (the "JUN·22·29·JUL·13" pattern from the mockup),
// short date in the day bucket.
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
  // 'day' and 'week': just the day number, with the month name added once
  // when the month changes. ('day' used to repeat the month on EVERY label
  // via shortDate — the user caught it in a screenshot, this fix is for that.)
  if (!prevBucketStart || d.getMonth() !== new Date(`${prevBucketStart}T00:00:00`).getMonth()) {
    return d.toLocaleDateString(DATE_LOCALE[lang], { month: 'short' }).toUpperCase();
  }
  return String(d.getDate());
}

// "History" bars — horizontally SCROLLABLE (same principle as the Score
// chart): fixed-width columns, auto-scrolls to the most recent bucket (right
// edge) on open. The value label has NO unit (just the abbreviated number,
// e.g. "11.4k") — adding a unit looked overly cramped in narrow columns
// (user feedback); the unit is already readable in the title/"Goal" section.
// Ink color for the value written INSIDE the bar: since the habit color is a
// user choice, a fixed dark/light text doesn't read on every palette — it's
// chosen based on the background's brightness (BT.601).
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#0a0a0a';
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0a0a0a' : '#ffffff';
}
