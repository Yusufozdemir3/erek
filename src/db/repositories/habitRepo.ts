// Habit repository.
// Important design decision: streak is NEVER stored, it's always computed from
// logs. Reason: storing derived data creates inconsistency during sync. Logs
// are the single source of truth.

import { getDb } from '../database';
import {
  chunk,
  isQuotaSchedule,
  isScheduledOn,
  isWithinHabitDates,
  newId,
  nowIso,
  parseJson,
  todayDate,
  toJson,
  toYmd,
  weekStartOf,
} from '../../lib/helpers';

// — QUOTA ("X times a week") streak helpers —
// Under a quota rule no single day is due on its own, so streaks are counted
// in WEEKS, not days: a week is "done" once the number of completed days
// within it reaches the quota. Weeks start on Monday (weekStartOf).

// Counts completed log dates keyed by their week-start.
function weekCompletionCounts(dates: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const ws = weekStartOf(d);
    counts.set(ws, (counts.get(ws) ?? 0) + 1);
  }
  return counts;
}

function shiftWeek(weekStart: string, weeks: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toYmd(d);
}
import type { GoalContribution, Habit, HabitKind, HabitLog, Recurrence } from '../../types/models';
import { goalRepo } from './goalRepo';
import { reminderRepo } from './reminderRepo';

function rowToHabit(row: any): Habit {
  return {
    id: row.id,
    user_id: row.user_id,
    goal_id: row.goal_id,
    title: row.title,
    kind: (row.kind ?? 'binary') as HabitKind,
    remind_at: row.remind_at,
    icon: row.icon,
    color: row.color,
    schedule: parseJson<Recurrence>(row.schedule),
    target_amount: row.target_amount,
    unit: row.unit,
    start_date: row.start_date,
    end_date: row.end_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
    goal_contribution: row.goal_contribution ?? null,
    goal_factor: row.goal_factor ?? 1,
  };
}

export interface CreateHabitInput {
  user_id: string;
  title: string;
  kind?: HabitKind; // defaults to 'binary'
  remind_at?: string | null;
  goal_id?: string | null;
  icon?: string | null;
  color?: string | null;
  schedule?: Recurrence | null;
  target_amount?: number | null;
  unit?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  goal_contribution?: GoalContribution | null; // NULL = per_completion (default)
  goal_factor?: number;                        // only meaningful in 'amount' mode; defaults to 1
}

export const habitRepo = {
  create(input: CreateHabitInput): Habit {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO habits
       (id, user_id, goal_id, title, kind, remind_at, icon, color, schedule, target_amount, unit, start_date, end_date, goal_contribution, goal_factor, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        id,
        input.user_id,
        input.goal_id ?? null,
        input.title,
        input.kind ?? 'binary',
        input.remind_at ?? null,
        input.icon ?? null,
        input.color ?? null,
        toJson(input.schedule ?? null),
        input.target_amount ?? null,
        input.unit ?? null,
        input.start_date ?? null,
        input.end_date ?? null,
        input.goal_contribution ?? null,
        input.goal_factor ?? 1,
        now,
      ]
    );
    return this.getById(id)!;
  },

  getById(id: string): Habit | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM habits WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? rowToHabit(row) : null;
  },

  listByUser(userId: string): Habit[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habits WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToHabit);
  },

  update(id: string, fields: Partial<CreateHabitInput>): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.kind !== undefined) { sets.push('kind = ?'); vals.push(fields.kind); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.goal_id !== undefined) { sets.push('goal_id = ?'); vals.push(fields.goal_id); }
    if (fields.icon !== undefined) { sets.push('icon = ?'); vals.push(fields.icon); }
    if (fields.color !== undefined) { sets.push('color = ?'); vals.push(fields.color); }
    if (fields.schedule !== undefined) { sets.push('schedule = ?'); vals.push(toJson(fields.schedule)); }
    if (fields.target_amount !== undefined) { sets.push('target_amount = ?'); vals.push(fields.target_amount); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    if (fields.end_date !== undefined) { sets.push('end_date = ?'); vals.push(fields.end_date); }
    if (fields.goal_contribution !== undefined) { sets.push('goal_contribution = ?'); vals.push(fields.goal_contribution); }
    if (fields.goal_factor !== undefined) { sets.push('goal_factor = ?'); vals.push(fields.goal_factor); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE habits SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  // Soft-deletes a habit AND its reminder rows.
  // Reminders must be cleaned up here, NOT by the caller: deletion happens
  // from four different places (the list screen, the edit panel, …) and each
  // one would need to remember it separately — none of them did. The result
  // was rows staying active and being pushed to the cloud forever, then
  // getting a new identity and being re-sent again on account merge. The
  // notification itself is a separate matter (the OS queue) and its caller
  // cancels it — this is only about DATA.
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE habits SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
    reminderRepo.deleteAllForEntity('habit', id);
  },

  // Marks a habit completed/not-completed for a given day.
  // Thanks to UNIQUE(habit_id, log_date), the same day never gets two records - if one exists, it's updated.
  toggleLog(habitId: string, date: string, completed: boolean): void {
    const db = getDb();
    const now = nowIso();
    const existing = db.getFirstSync<any>(
      `SELECT id, completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    const wasCompleted = existing?.completed === 1;
    if (existing) {
      db.runSync(
        `UPDATE habit_logs SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
        [completed ? 1 : 0, now, existing.id]
      );
    } else {
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, updated_at, synced) VALUES (?, ?, ?, ?, ?, 0)`,
        [newId(), habitId, date, completed ? 1 : 0, now]
      );
    }
    this.bumpGoalIfLinked(habitId, wasCompleted, completed);
  },

  // If a habit is linked to a goal in "per_completion" mode (the default),
  // updates the linked goal's progress ON THE COMPLETION TRANSITION: completed
  // -> +1, undone -> −1. Only runs when the state actually changed; re-writing
  // the same state (e.g. re-checking an already-completed day) doesn't affect
  // the goal -> no double counting. Retroactively marking a past day is also a
  // valid transition. goalRepo.addProgress clamps to the 0..target range and
  // already ignores a non-numeric goal.
  // Habits in 'amount' mode never reach this function (see incrementAmount) —
  // for them the contribution depends on the actual amount difference at that moment, not the completion state.
  // NOTE: in multi-device sync, goal.current_value is carried by LWW; this is
  // the same existing limitation as manual +1/+5 progress (concurrent
  // contributions don't merge).
  // If `habit` is given (incrementAmount already fetched it), it's not queried again.
  bumpGoalIfLinked(
    habitId: string,
    wasCompleted: boolean,
    isCompleted: boolean,
    habit?: Habit | null
  ): void {
    if (wasCompleted === isCompleted) return;
    const h = habit !== undefined ? habit : this.getById(habitId);
    if (!h?.goal_id) return;
    goalRepo.addProgress(h.goal_id, isCompleted ? 1 : -1);
  },

  // Whether a habit was completed on a given day.
  isCompletedOn(habitId: string, date: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.completed === 1;
  },

  // Numeric habit: the amount done on a given day (0 if there's no record).
  getAmountOn(habitId: string, date: string): number {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT amount FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.amount ?? 0;
  },

  // The MULTI version of getAmountOn + isCompletedOn: instead of the "Today"
  // screen firing two separate queries per habit (N+1) for that day's
  // amount+completion, it gets everything in one query. Since habit_logs has
  // UNIQUE(habit_id, log_date), at most one row comes back per habit; a habit
  // with no log doesn't show up at all in the result (the caller assumes
  // amount=0 / completed=false).
  getDayStates(
    habitIds: string[],
    date: string
  ): Record<string, { amount: number; completed: boolean }> {
    const db = getDb();
    const out: Record<string, { amount: number; completed: boolean }> = {};
    // Chunked: the number of bound `IN (…)` parameters equals the list
    // length, while SQLite's own limit is fixed (see helpers.chunk).
    for (const ids of chunk(habitIds)) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.getAllSync<{ habit_id: string; amount: number; completed: number }>(
        `SELECT habit_id, amount, completed FROM habit_logs
         WHERE log_date = ? AND habit_id IN (${placeholders})`,
        [date, ...ids]
      );
      for (const r of rows) out[r.habit_id] = { amount: r.amount ?? 0, completed: r.completed === 1 };
    }
    return out;
  },

  // The RANGE version of getDayStates: for the given habits, the set of days
  // marked COMPLETED within [start, end], one set per habit. The "Habits"
  // screen's last-7-days strip uses this — it used to fire a separate
  // recentLogs query per habit (N+1 that grew linearly as the list got longer).
  completedDatesBetween(
    habitIds: string[],
    startYmd: string,
    endYmd: string
  ): Record<string, Set<string>> {
    const db = getDb();
    const out: Record<string, Set<string>> = {};
    for (const ids of chunk(habitIds)) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.getAllSync<{ habit_id: string; log_date: string }>(
        `SELECT habit_id, log_date FROM habit_logs
         WHERE completed = 1 AND log_date >= ? AND log_date <= ?
           AND habit_id IN (${placeholders})`,
        [startYmd, endYmd, ...ids]
      );
      for (const r of rows) (out[r.habit_id] ??= new Set()).add(r.log_date);
    }
    return out;
  },

  // Numeric habit: changes that day's amount by a delta (never goes below 0).
  // completed becomes 1 once the target is reached (amount >= target). If
  // target is null/0, completed always stays 0. A single record is kept via UNIQUE(habit_id, log_date).
  incrementAmount(habitId: string, date: string, delta: number, target: number | null): void {
    const db = getDb();
    const now = nowIso();
    const existing = db.getFirstSync<any>(
      `SELECT id, amount, completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    const wasCompleted = existing?.completed === 1;
    const current = existing ? existing.amount ?? 0 : 0;
    const next = Math.max(0, current + delta);
    // Clamping at the 0 floor can make the requested delta diverge from the
    // difference actually applied (e.g. current=2, delta=-5 requested ->
    // next=0, actual difference is -2) — in 'amount' mode, the goal reflects
    // this actual difference, not the requested one.
    const appliedDelta = next - current;
    const completed = target != null && target > 0 && next >= target ? 1 : 0;
    if (existing) {
      db.runSync(
        `UPDATE habit_logs SET amount = ?, completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
        [next, completed, now, existing.id]
      );
    } else {
      db.runSync(
        `INSERT INTO habit_logs (id, habit_id, log_date, completed, amount, updated_at, synced)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [newId(), habitId, date, completed, next, now]
      );
    }
    // Goal contribution is one of two modes: in 'amount' mode, EVERY change
    // (not waiting for completion) applies the actual difference × the
    // multiplier to the goal; otherwise (the default, per_completion) only the
    // completion STATE transition applies +1/-1.
    const habit = this.getById(habitId);
    if (habit?.goal_id && habit.goal_contribution === 'amount') {
      if (appliedDelta !== 0) goalRepo.addProgress(habit.goal_id, appliedDelta * habit.goal_factor);
    } else {
      this.bumpGoalIfLinked(habitId, wasCompleted, completed === 1, habit);
    }
  },

  // STREAK COMPUTATION: counts backward from today over the habit's SCHEDULED
  // days. Only days that are due per the schedule AND within the lifespan
  // (start/end) are considered — a gap on an unscheduled/out-of-range day
  // doesn't break the streak (e.g. Tuesday doesn't matter for a Mon/Wed/Fri
  // habit; neither do days after the end date). If today is scheduled but not
  // yet marked, the streak isn't broken (it continues from the previous
  // scheduled day). Stops at the first missed scheduled day.
  // Under a QUOTA (X times a week) rule the result is a count of WEEKS, not
  // days: consecutive weeks whose quota was met; if the current week hasn't
  // met it yet, the streak isn't broken (the week isn't over), but it doesn't count either.
  // If `preloaded` is given, the habit is NOT QUERIED again (same pattern as
  // in bumpGoalIfLinked). List screens already hold the habit and call this
  // function per row; the getById inside would mean an unnecessary second query per habit in the list.
  currentStreak(habitId: string, preloaded?: Habit | null): number {
    const db = getDb();
    const habit = preloaded !== undefined ? preloaded : this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs
       WHERE habit_id = ? AND completed = 1
       ORDER BY log_date DESC`,
      [habitId]
    );
    if (rows.length === 0) return 0;

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      let cursor = weekStartOf(todayDate());
      let streak = 0;
      if ((counts.get(cursor) ?? 0) >= quota) streak++;
      // The current week not being done yet doesn't break it — continue from previous weeks.
      cursor = shiftWeek(cursor, -1);
      while ((counts.get(cursor) ?? 0) >= quota) {
        streak++;
        cursor = shiftWeek(cursor, -1);
      }
      return streak;
    }

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    let streak = 0;
    const cursor = new Date(`${today}T00:00:00`);

    // Walk backward day by day; only evaluate scheduled days.
    // The upper bound covers ~2+ years (generous for sparse days in a weekly schedule).
    for (let i = 0; i < 800; i++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          streak++;
        } else if (dateStr === today) {
          // Today isn't marked yet — don't break the streak, skip it.
        } else {
          break;
        }
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  },

  // Completion records from the last N days (for stats/calendar).
  recentLogs(habitId: string, days: number): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs
       WHERE habit_id = ?
       ORDER BY log_date DESC
       LIMIT ?`,
      [habitId, days]
    );
    return rows as HabitLog[];
  },

  // ALL logs from a given date (inclusive) through today (for the stats
  // screen: heatmap, completion rate, total amount — all derived from this
  // single query). Difference from recentLogs: it filters by date range, not
  // row count — empty days (no log at all) must be filled in by the caller with the full list of days.
  logsInRange(habitId: string, sinceYmd: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? AND log_date >= ? ORDER BY log_date ASC`,
      [habitId, sinceYmd]
    );
    return rows as HabitLog[];
  },

  // ALL of a habit's historical logs (ascending by date). The stats screen's
  // score/streak/day-of-week calculations are all derived from this one query.
  allLogs(habitId: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY log_date ASC`,
      [habitId]
    );
    return rows as HabitLog[];
  },

  // For a QUOTA (X times a week) habit, the number of completed days in the
  // week of a given date — used for the "2/3 this week" indicator on the "Today" screen.
  completionsInWeek(habitId: string, dateYmd: string): number {
    const db = getDb();
    const start = weekStartOf(dateYmd);
    const endD = new Date(`${start}T00:00:00`);
    endD.setDate(endD.getDate() + 6);
    const rows = db.getAllSync<any>(
      `SELECT COUNT(*) AS n FROM habit_logs
       WHERE habit_id = ? AND completed = 1 AND log_date >= ? AND log_date <= ?`,
      [habitId, start, toYmd(endD)]
    );
    return rows[0]?.n ?? 0;
  },

  // Logs between two dates (inclusive) — for the calendar's month view.
  // Difference from logsInRange: not an open-ended "through today", but a
  // CLOSED range (used when browsing past months).
  logsBetween(habitId: string, startYmd: string, endYmd: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date ASC`,
      [habitId, startYmd, endYmd]
    );
    return rows as HabitLog[];
  },

  // LONGEST STREAK: unlike currentStreak's "backward from today" approach,
  // this scans the entire history from front to back, from the first
  // completed day to today, and returns the longest consecutive scheduled-day
  // streak it ever saw. Uses the same scheduled-day rule (a gap on an
  // unscheduled/out-of-range day doesn't break the streak).
  // Under a QUOTA rule the result is a count of WEEKS; if the current
  // (unfinished) week hasn't met the quota, the streak isn't BROKEN but it
  // isn't counted either (consistent with currentStreak).
  longestStreak(habitId: string): number {
    const db = getDb();
    const habit = this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs
       WHERE habit_id = ? AND completed = 1
       ORDER BY log_date ASC`,
      [habitId]
    );
    if (rows.length === 0) return 0;

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      const currentWeek = weekStartOf(todayDate());
      let cursor = weekStartOf(rows[0].log_date);
      let run = 0;
      let best = 0;
      while (cursor <= currentWeek) {
        if ((counts.get(cursor) ?? 0) >= quota) {
          run++;
          if (run > best) best = run;
        } else if (cursor !== currentWeek) {
          run = 0;
        }
        cursor = shiftWeek(cursor, 1);
      }
      return best;
    }

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    let run = 0;
    let best = 0;
    const cursor = new Date(`${rows[0].log_date}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);

    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          run++;
          if (run > best) best = run;
        } else {
          run = 0;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return best;
  },

  // ALL STREAKS: the SAME walk and SAME scheduled-day rule as longestStreak,
  // but instead of a single "best" it collects EVERY consecutive streak in the
  // past (length + start/end date) — for the stats screen's "streak history"
  // list. Deliberately consistent: produces exactly the same result as
  // longestStreak's no-tolerance-for-today rule (there is NO separate
  // "current" special case).
  // Under a QUOTA rule the entries are week-based (length = number of weeks,
  // start/end = the Monday of the streak's first week / the Sunday of its last week).
  allStreaks(habitId: string): { length: number; start: string; end: string }[] {
    const db = getDb();
    const habit = this.getById(habitId);
    const isDue = (d: string) =>
      isScheduledOn(habit?.schedule ?? null, d) &&
      isWithinHabitDates(habit?.start_date ?? null, habit?.end_date ?? null, d);
    const rows = db.getAllSync<any>(
      `SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1 ORDER BY log_date ASC`,
      [habitId]
    );
    if (rows.length === 0) return [];

    if (isQuotaSchedule(habit?.schedule ?? null)) {
      const quota = habit!.schedule!.timesPerWeek!;
      const counts = weekCompletionCounts(rows.map((r) => r.log_date));
      const currentWeek = weekStartOf(todayDate());
      const streaks: { length: number; start: string; end: string }[] = [];
      let cursor = weekStartOf(rows[0].log_date);
      let run = 0;
      let runStart: string | null = null;
      let runEnd: string | null = null;
      const flush = () => {
        if (run > 0 && runStart && runEnd) {
          const d = new Date(`${runEnd}T00:00:00`);
          d.setDate(d.getDate() + 6); // the week's Sunday
          streaks.push({ length: run, start: runStart, end: toYmd(d) });
        }
        run = 0;
        runStart = null;
        runEnd = null;
      };
      while (cursor <= currentWeek) {
        if ((counts.get(cursor) ?? 0) >= quota) {
          if (run === 0) runStart = cursor;
          run++;
          runEnd = cursor;
        } else if (cursor !== currentWeek) {
          flush(); // an unfinished current week doesn't break the streak (consistent with longestStreak)
        }
        cursor = shiftWeek(cursor, 1);
      }
      flush();
      return streaks.sort((a, b) => b.length - a.length);
    }

    const completed = new Set<string>(rows.map((r) => r.log_date));
    const today = todayDate();
    const cursor = new Date(`${rows[0].log_date}T00:00:00`);
    const end = new Date(`${today}T00:00:00`);

    const streaks: { length: number; start: string; end: string }[] = [];
    let run = 0;
    let runStart: string | null = null;
    let runEnd: string | null = null;
    const flush = () => {
      if (run > 0 && runStart && runEnd) streaks.push({ length: run, start: runStart, end: runEnd });
      run = 0;
      runStart = null;
      runEnd = null;
    };

    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      if (isDue(dateStr)) {
        if (completed.has(dateStr)) {
          if (run === 0) runStart = dateStr;
          run++;
          runEnd = dateStr;
        } else {
          flush();
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    flush(); // also include a streak still open when the loop ends

    return streaks.sort((a, b) => b.length - a.length);
  },
};
