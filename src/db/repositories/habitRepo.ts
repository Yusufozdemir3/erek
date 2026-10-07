// Habits. Streaks are never stored, always computed from the logs: stored
// derived data would drift during sync.

import { getDb } from '../database';
import {
  chunk,
  newId,
  nowIso,
  parseJson,
  shiftYmd,
  todayDate,
  toJson,
  toYmd,
  weekStartOf,
} from '../../lib/helpers';
import { currentStreakFrom } from '../../lib/streaks';
import type { GoalContribution, Habit, HabitKind, HabitLog, Recurrence } from '../../types/models';
import { goalRepo } from './goalRepo';
import { reminderRepo } from './reminderRepo';

// Returned when this check-off just completed the linked goal, so the UI can
// offer to unlink the habit; null otherwise.
export interface GoalJustCompleted {
  goalId: string;
  goalTitle: string;
}

// Applies a delta and reports whether it is what completed the goal (an
// already-done goal reports null, so the prompt doesn't repeat).
function applyGoalDelta(goalId: string, delta: number): GoalJustCompleted | null {
  if (delta === 0) return null;
  const before = goalRepo.getById(goalId);
  const wasDone = before != null && goalRepo.isCompleted(before);
  goalRepo.addProgress(goalId, delta);
  if (wasDone) return null;
  const after = goalRepo.getById(goalId);
  return after && goalRepo.isCompleted(after) ? { goalId: after.id, goalTitle: after.title } : null;
}

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
    skip_dates: parseJson<string[]>(row.skip_dates) ?? [],
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
  goal_contribution?: GoalContribution | null; // NULL = per_completion
  goal_factor?: number;                        // 'amount' mode only; defaults to 1
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

  // Soft-deletes the habit AND its reminder rows — here, not in each of the
  // several callers, which kept forgetting. Cancelling the scheduled
  // notification is the caller's job.
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE habits SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
    reminderRepo.deleteAllForEntity('habit', id);
  },

  // Undoes softDelete, reminders included; the newer updated_at wins over the
  // deletion already synced. false if the row isn't deleted.
  restore(id: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<{ deleted_at: string | null }>(`SELECT deleted_at FROM habits WHERE id = ?`, [id]);
    if (!row?.deleted_at) return false;
    db.runSync(`UPDATE habits SET deleted_at = NULL, updated_at = ?, synced = 0 WHERE id = ?`, [nowIso(), id]);
    reminderRepo.restoreForEntity('habit', id, row.deleted_at);
    return true;
  },

  // One row per day (UNIQUE(habit_id, log_date)): updated if it exists.
  toggleLog(habitId: string, date: string, completed: boolean): GoalJustCompleted | null {
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
    return this.bumpGoalIfLinked(habitId, wasCompleted, completed);
  },

  // per_completion mode: +1 when a day becomes completed, −1 when it's undone
  // (past days included). Only on an actual transition, so rewriting the same
  // state never double-counts. 'amount' mode is handled in incrementAmount.
  // `habit` skips a second lookup when the caller already has it.
  bumpGoalIfLinked(
    habitId: string,
    wasCompleted: boolean,
    isCompleted: boolean,
    habit?: Habit | null
  ): GoalJustCompleted | null {
    if (wasCompleted === isCompleted) return null;
    const h = habit !== undefined ? habit : this.getById(habitId);
    if (!h?.goal_id) return null;
    return applyGoalDelta(h.goal_id, isCompleted ? 1 : -1);
  },

  isCompletedOn(habitId: string, date: string): boolean {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.completed === 1;
  },

  // 0 when there's no log.
  getAmountOn(habitId: string, date: string): number {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT amount FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    return row?.amount ?? 0;
  },

  // getAmountOn + isCompletedOn for many habits in one query. A habit without
  // a log is missing from the result (= amount 0, not completed).
  getDayStates(
    habitIds: string[],
    date: string
  ): Record<string, { amount: number; completed: boolean }> {
    const db = getDb();
    const out: Record<string, { amount: number; completed: boolean }> = {};
    // Chunked to stay under SQLite's bound-parameter limit (helpers.chunk).
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

  // Completed days within [start, end] for many habits in one query (the
  // Habits screen's 7-day strip).
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

  // Rest day: a day skipped on purpose counts as unscheduled everywhere
  // (isWithinHabitDates) — the streak freezes, the rate ignores it. Today and
  // past days only; marks older than a year are dropped.
  setSkipped(habitId: string, ymd: string, skipped: boolean): void {
    const habit = this.getById(habitId);
    if (!habit) return;
    const set = new Set(habit.skip_dates ?? []);
    if (skipped) set.add(ymd);
    else set.delete(ymd);
    const horizon = shiftYmd(todayDate(), -400);
    const next = [...set].filter((d) => d >= horizon).sort();
    getDb().runSync(
      `UPDATE habits SET skip_dates = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [next.length ? JSON.stringify(next) : null, nowIso(), habitId]
    );
  },

  // Changes the day's amount by a delta (floored at 0); completed once
  // amount >= target (never without a target).
  incrementAmount(habitId: string, date: string, delta: number, target: number | null): GoalJustCompleted | null {
    const db = getDb();
    const now = nowIso();
    const existing = db.getFirstSync<any>(
      `SELECT id, amount, completed FROM habit_logs WHERE habit_id = ? AND log_date = ?`,
      [habitId, date]
    );
    const wasCompleted = existing?.completed === 1;
    const current = existing ? existing.amount ?? 0 : 0;
    const next = Math.max(0, current + delta);
    // The floor can shrink the delta; 'amount' mode passes on the applied one.
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
    // 'amount' mode: every change adds difference × factor to the goal;
    // per_completion: only a completion transition counts (±1).
    const habit = this.getById(habitId);
    if (habit?.goal_id && habit.goal_contribution === 'amount') {
      return applyGoalDelta(habit.goal_id, appliedDelta * habit.goal_factor);
    }
    return this.bumpGoalIfLinked(habitId, wasCompleted, completed === 1, habit);
  },

  // Counts back from today over SCHEDULED days only (schedule, lifespan, rest
  // days), so unscheduled days never break it. An unmarked today doesn't break
  // it either. Quota habits (X a week) count WEEKS that met the quota; the
  // current week only counts once met. `preloaded` skips the lookup in lists.
  currentStreak(habitId: string, preloaded?: Habit | null): number {
    const db = getDb();
    const habit = preloaded !== undefined ? preloaded : this.getById(habitId);
    const rows = db.getAllSync<{ log_date: string }>(
      `SELECT log_date FROM habit_logs WHERE habit_id = ? AND completed = 1`,
      [habitId]
    );
    return currentStreakFrom(habit, rows.map((r) => r.log_date), todayDate());
  },

  // Every log, oldest first (the stats screen's single source).
  allLogs(habitId: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? ORDER BY log_date ASC`,
      [habitId]
    );
    return rows as HabitLog[];
  },

  // Completed days in dateYmd's week, for a quota habit's "2/3".
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

  // Logs within a closed range (the calendar's month view).
  logsBetween(habitId: string, startYmd: string, endYmd: string): HabitLog[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM habit_logs WHERE habit_id = ? AND log_date >= ? AND log_date <= ? ORDER BY log_date ASC`,
      [habitId, startYmd, endYmd]
    );
    return rows as HabitLog[];
  },
};
