// Pure formatters for the goal screens.

import { fmtClock, isTimeUnit } from '@/lib/helpers';

// Whole numbers bare, otherwise 1 decimal.
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// A goal value with its unit: duration goals (helpers.TIME_UNIT) as a clock.
// All unit rendering goes through here, so "__time__" never reaches the screen.
export function fmtGoalValue(n: number, unit: string | null): string {
  return isTimeUnit(unit) ? fmtClock(n) : `${fmtAmount(n)}${unit ? ` ${unit}` : ''}`;
}
