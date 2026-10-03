// Pure formatters for the goal screens — SPLIT OUT of app/goal/[id].tsx.
// Since they don't depend on React, they can be tested directly in the fast
// 'logic' test project (same rationale as lib/timerLogic.ts, lib/goalProjection.ts).

import { fmtClock, isTimeUnit } from '@/lib/helpers';

// No decimals for whole numbers, otherwise 1 decimal (same pattern as fmt in AmountStepper).
export function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Formats a goal value based on its unit — for time-measured goals (see
// helpers.TIME_UNIT) it renders the value stored in seconds as
// hours:minutes:seconds; otherwise a number+free-form unit string (legacy
// behavior). ALL unit rendering must go through here so the raw "__time__"
// marker never leaks onto the screen as raw text.
export function fmtGoalValue(n: number, unit: string | null): string {
  return isTimeUnit(unit) ? fmtClock(n) : `${fmtAmount(n)}${unit ? ` ${unit}` : ''}`;
}
