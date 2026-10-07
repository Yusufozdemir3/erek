// Pure time math for timers (TimerProvider). The count is never stored: it is
// computed from {startedAt, baseSeconds} and the wall clock, so it stays right
// while the app is closed. `now` is a parameter for tests.
//
// A session belongs to the day it STARTED (23:50–00:20 counts for the
// evening); splitting it at midnight would buy nothing.

// A timer habit, or a duration goal (unit = TIME_UNIT).
export type TimerKind = 'habit' | 'goal';

export interface ActiveTimer {
  kind: TimerKind;
  targetId: string;
  date: string;          // "YYYY-MM-DD" it started (habits only)
  startedAt: number;     // epoch ms
  baseSeconds: number;   // seconds accumulated at start
  targetSeconds: number; // target seconds
}

// base + elapsed, not clamped to the target (it may keep running past it).
// A clock turned back never makes it negative.
export function elapsedOf(a: ActiveTimer, now: number = Date.now()): number {
  const ran = Math.max(0, (now - a.startedAt) / 1000);
  return a.baseSeconds + ran;
}

// Whole seconds this session adds to the DB on pause/finish; never negative.
export function commitDelta(a: ActiveTimer, now: number = Date.now()): number {
  return Math.max(0, Math.round(elapsedOf(a, now) - a.baseSeconds));
}

// Target reached (the timer keeps running; this only marks completion).
export function isFinished(a: ActiveTimer, now: number = Date.now()): boolean {
  return elapsedOf(a, now) >= a.targetSeconds;
}

// — RESTORE AFTER THE PROCESS DIED —
// The wall clock can't tell how long a timer really ran while the app was
// killed: reopening two days later would book ~48 hours on a past day. Two
// rules apply only on restore:

// 1) The session is over if the day changed or the target was reached while
//    closed; continuing means starting a new one.
export function isStaleSession(
  a: ActiveTimer,
  todayYmd: string,
  now: number = Date.now()
): boolean {
  return a.date !== todayYmd || isFinished(a, now);
}

// 2) A stale session books at most what was left to the target (0 if it was
//    already reached) — nothing beyond it can be assumed.
export function restoreCommitDelta(a: ActiveTimer, now: number = Date.now()): number {
  const room = Math.max(0, a.targetSeconds - a.baseSeconds);
  return Math.min(commitDelta(a, now), room);
}
