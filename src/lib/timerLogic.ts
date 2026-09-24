// PURE time math for the timer habit — independent of TimerProvider,
// testable without UI. Derived from the running-state triple
// {startedAt, baseSeconds, targetSeconds}; the counter isn't stored, it's
// computed from the wall clock (correct even if the app is closed). All
// functions take a `now` parameter (pinned in tests).
//
// MIDNIGHT DECISION (deliberate): a session is recorded on whichever day it
// STARTED (ActiveTimer.date is fixed at the start). 30 minutes starting at
// 23:50 and ending at 00:20 go into the starting day's record — a habit
// session is "that evening's work"; splitting it at midnight would be
// complexity with no benefit to user intuition.

// A timer can be attached to a habit (kind='timer') or to a duration-tracked
// numeric goal (unit=TIME_UNIT) — see TimerProvider.
export type TimerKind = 'habit' | 'goal';

export interface ActiveTimer {
  kind: TimerKind;
  targetId: string;
  date: string;          // "YYYY-MM-DD" (the day it started — see the decision above; only used for habits)
  startedAt: number;     // epoch ms
  baseSeconds: number;   // seconds accumulated at start
  targetSeconds: number; // target seconds
}

// Total seconds so far (base + elapsed). NOT CLAMPED to the target — the user
// can keep the timer running as long as they want even after passing the target.
// If the clock is turned back (now < startedAt), elapsed never goes negative.
export function elapsedOf(a: ActiveTimer, now: number = Date.now()): number {
  const ran = Math.max(0, (now - a.startedAt) / 1000);
  return a.baseSeconds + ran;
}

// The seconds to add to the DB at pause/finish time (the part that ran in
// this session). Rounded to whole seconds; never negative under any condition.
export function commitDelta(a: ActiveTimer, now: number = Date.now()): number {
  return Math.max(0, Math.round(elapsedOf(a, now) - a.baseSeconds));
}

// Has the target been reached? (used for marking completion and the restore
// decision on startup — the timer does NOT STOP at the target, it's just
// marked complete and keeps running)
export function isFinished(a: ActiveTimer, now: number = Date.now()): boolean {
  return elapsedOf(a, now) >= a.targetSeconds;
}

// — RESTORE AFTER PROCESS DEATH —
//
// The wall-clock model above relies on the assumption "the timer keeps
// running in the background too," and that's correct while the app is OPEN:
// a user can go past a 20-minute target and choose to work 30 minutes, and
// the full 30 minutes is honestly recorded (see the commitDelta tests). BUT
// this assumption breaks once the process dies: the timer wasn't ACTUALLY
// running during that gap, and the startedAt in persisted state only tells
// you "when it was last started."
//
// Behavior before the fix: if a session with a 20-minute target was started
// in the evening, the app was killed, and it's reopened two days later, on
// launch `elapsedOf` would return ~48 HOURS, and all of it would be written
// to the day the session STARTED (a.date). The result was permanent: stats
// and (if the habit was linked to a goal in 'amount' mode) the goal counter
// would get corrupted, and since the entry landed on a PAST day rather than
// today, even the "Reset" button couldn't fix it.
//
// Two rules together close this gap without changing anything while the app is open:

// 1) Is the session "stale" — i.e. should it be considered no longer running
//    once the process restarts? The session is over if the day has changed
//    (the entry would already go to a past day) or if the target was reached
//    while closed. If the user wants to continue, they start a NEW session
//    with ▶; no data is lost, since the accumulated time is already written to the DB.
export function isStaleSession(
  a: ActiveTimer,
  todayYmd: string,
  now: number = Date.now()
): boolean {
  return a.date !== todayYmd || isFinished(a, now);
}

// 2) The time written when closing a stale session is CAPPED at what's left
//    to the target. We can't assume the target was exceeded while the process
//    was dead (nobody was watching it), but the part up to the target is the
//    work the user actually started, and it's preserved. Returns 0 if base
//    was already at or above the target — we know nothing about that gap, so we don't make anything up.
export function restoreCommitDelta(a: ActiveTimer, now: number = Date.now()): number {
  const room = Math.max(0, a.targetSeconds - a.baseSeconds);
  return Math.min(commitDelta(a, now), room);
}
