// Goal repository.
// Two types: 'numeric' (progress like 50/100 km) and 'milestone' (can be
// broken into steps, same logic as task/subtask). Both types can now have a deadline.

import { getDb } from '../database';
import { newId, nowIso, todayDate } from '../../lib/helpers';
import { goalEntryRepo } from './goalEntryRepo';
import { reminderRepo } from './reminderRepo';
import type { Goal, GoalType } from '../../types/models';

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    goal_type: row.goal_type as GoalType,
    target_value: row.target_value,
    current_value: row.current_value,
    unit: row.unit,
    deadline: row.deadline,
    completed_at: row.completed_at,
    remind_at: row.remind_at,
    start_date: row.start_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
    value_baseline: row.value_baseline ?? 0,
  };
}

// The single place where current_value is DERIVED from entries (see
// migration019):
//   current_value = value_baseline + sum of active entries, 0-based.
// Since entries are additive and sync independently, two devices'
// contributions merge without conflict; the baseline only carries manual
// corrections and legacy accumulated value.
//
// 0 FLOOR: on a single device addProgress already applies the floor, but if
// two devices simultaneously apply a negative correction, the total could dip
// below zero — we clamp on read so a nonsensical value like "-5 km" never
// surfaces.
//
// bumpSync: the row should be re-sent if the value changed due to a USER
// ACTION (addProgress, manual edit). During sync's post-pull recompute, pass
// FALSE instead — otherwise every round would re-push all goals in a feedback
// loop even when nothing actually changed.
function recompute(id: string, bumpSync: boolean): void {
  const db = getDb();
  const sums = bumpSync ? ', updated_at = ?, synced = 0' : '';
  const vals = bumpSync ? [nowIso(), id] : [id];
  db.runSync(
    `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
       SELECT SUM(amount) FROM goal_entries
        WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
     ), 0))${sums} WHERE id = ?`,
    vals
  );
}

export interface CreateGoalInput {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
  start_date?: string | null; // defaults to today if not given (day zero for the pace calculation)
}

export const goalRepo = {
  create(input: CreateGoalInput): Goal {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goals
       (id, user_id, title, goal_type, target_value, current_value, unit, deadline, remind_at, start_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.title, input.goal_type,
       input.target_value ?? null, input.unit ?? null, input.deadline ?? null,
       input.remind_at ?? null, input.start_date ?? todayDate(), now]
    );
    return this.getById(id)!;
  },

  getById(id: string): Goal | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL`, [id]
    );
    return row ? rowToGoal(row) : null;
  },

  listByUser(userId: string): Goal[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToGoal);
  },

  // Updates a goal's definition (title, target value, unit, deadline, current
  // value). goal_type is never changed — changing the type would leave fields
  // inconsistent. If current_value is given it's only clamped to a 0 floor;
  // there's NO upper limit (see addProgress: a goal is a threshold, not a
  // cap). There used to be a ceiling here too, and lowering a goal's target
  // silently truncated existing progress (a goal targeting 100 with 50 already
  // accumulated, retargeted to 10, turned that 50 into 10 — the user's actual
  // work vanished).
  update(
    id: string,
    fields: Partial<{
      title: string;
      target_value: number | null;
      unit: string | null;
      deadline: string | null;
      remind_at: string | null;
      start_date: string | null;
      current_value: number;
      // Whether manually changing "Current value" should ALSO log the
      // difference to the PROGRESS HISTORY (GoalForm's checkbox). false/
      // omitted means a silent correction.
      log_manual_change: boolean;
    }>
  ): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.target_value !== undefined) { sets.push('target_value = ?'); vals.push(fields.target_value); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.deadline !== undefined) { sets.push('deadline = ?'); vals.push(fields.deadline); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    // There are TWO ways to manually change "Current value", and NEITHER can
    // write current_value DIRECTLY anymore — that value is now derived from
    // entries (see migration019), so a directly-written number would just get
    // erased on the next recompute:
    //
    //   log_manual_change=false (default, SILENT CORRECTION): the difference
    //     is written to the BASELINE, nothing is added to the entry history.
    //     A manual correction isn't a day's work and shouldn't inflate the pace.
    //   log_manual_change=true: the difference is written as an ENTRY, the
    //     baseline is left untouched — the user is deliberately counting this
    //     as progress.
    //
    // The two are NEVER done together: this rule used to live on the screen
    // (app/goal/[id].tsx), which wrote to the baseline and THEN also added an
    // entry; the total instantly became `requested + difference` while
    // current_value stayed at `requested`. The value would jump on its own,
    // with the user doing nothing, on the next sync round. The rule now lives
    // here — in one place, both paths preserve the same invariant.
    // Must not go negative; no upper limit (see the note above).
    const requested = fields.current_value !== undefined ? Math.max(0, fields.current_value) : null;
    if (sets.length === 0 && requested === null) return;
    const before = requested !== null ? this.getById(id)?.current_value ?? 0 : 0;
    if (sets.length > 0) {
      sets.push('updated_at = ?'); vals.push(nowIso());
      sets.push('synced = 0');
      vals.push(id);
      db.runSync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (requested !== null) {
      const delta = requested - before;
      if (fields.log_manual_change) {
        if (delta !== 0) goalEntryRepo.create(id, delta);
      } else {
        db.runSync(
          `UPDATE goals SET value_baseline = ? - COALESCE((
             SELECT SUM(amount) FROM goal_entries
              WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
           ), 0) WHERE id = ?`,
          [requested, id]
        );
      }
      recompute(id, true);
    }
  },

  // Changes progress on a numeric goal by a DELTA (e.g. +5 km, -1 correction).
  //
  // NO CEILING (decision from 2026-08-03). current_value is now an honest
  // COUNTER: it holds exactly how much was done, and can exceed target_value.
  // A goal is a THRESHOLD, not a LIMIT, and the target only matters for
  // DISPLAY — progressRatio already clamps the ratio with Math.min(1, …),
  // useGoalStats.remaining clamps the remainder with Math.max(0, …), and
  // milestoneViews clamps threshold ratios. So nothing like a "120%-full bar"
  // ever appears; only the text honestly reads "120 / 100 km".
  //
  // WHY IT WAS REMOVED — clamping produced two separate data-loss bugs:
  //   1) When current_value had already exceeded the target (the timer could
  //      produce this), adding "+1 min" computed `next = target`, which
  //      PULLED PROGRESS BACKWARD: current=6000, target=3600, +60 ->
  //      applied = -2400 (40 minutes erased), and a -40:00 entry that never
  //      actually happened got logged into the history.
  //   2) While the goal was FULL, checking a linked habit on and back off was
  //      asymmetric: the +1 got clamped away and swallowed (applied=0) while
  //      the -1 was applied fully -> every cycle silently drained 1 unit from
  //      the goal (see habitRepo.bumpGoalIfLinked's assumption that "+1/-1 are
  //      symmetric"). With the ceiling gone, both apply in full.
  // The only remaining limit is the 0 floor: negative progress makes no sense.
  //
  // Only meaningful for 'numeric' goals: for a 'milestone' goal current_value
  // isn't used, so this is silently ignored (a linked habit's transition also
  // lands here; even if it's linked to a milestone goal, the counter stays intact).
  // Return value: the difference ACTUALLY applied — only the 0 floor can
  // shrink the requested delta (e.g. requesting -5 while current=2 gives an
  // actual difference of -2). The log records the ACTUAL difference, not the
  // requested one, so the history and the pace/projection computed from it
  // stay consistent with current_value. If the difference is 0, nothing is written.
  //
  // The entry write lives here ON PURPOSE: every caller used to also have to
  // call goalEntryRepo.create separately, and linked-habit contributions
  // (habitRepo) SKIPPED this -> they wouldn't show up in the goal's history,
  // and pace/projection was only computed from manual "Add" entries.
  // Consolidating it in one place means it can never be forgotten again.
  //
  // NOTE: manually setting "Current value" via `update` still doesn't write an
  // entry — that's a CORRECTION, not progress (it shouldn't be counted like a
  // day's work and inflate the pace).
  //
  // THE TIMER USES THIS TOO: there used to be a separate addTimeProgress,
  // whose only difference was not applying the ceiling. Once the ceiling was
  // removed, the two became byte-for-byte the same function, and keeping them
  // separate would have meant two write paths assuming DIFFERENT invariants on
  // the same field — which was exactly the root cause of bug (1) above.
  addProgress(id: string, amount: number): number {
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'numeric') return 0;
    const next = Math.max(0, goal.current_value + amount);
    const applied = next - goal.current_value;
    if (applied === 0) return 0;
    // Entry FIRST, recompute SECOND: current_value is now derived from
    // entries (see migration019 + recompute). Writing it directly would
    // conflict with the post-sync-pull recompute — and produces the same
    // result anyway, since the baseline stays fixed the total comes out to exactly `next`.
    goalEntryRepo.create(id, applied);
    recompute(id, true);
    return applied;
  },

  // A 0-1 progress ratio. For the UI's percentage indicator.
  progressRatio(goal: Goal): number {
    if (goal.goal_type === 'numeric' && goal.target_value && goal.target_value > 0) {
      return Math.min(1, goal.current_value / goal.target_value);
    }
    return 0;
  },

  // Whether a goal counts as completed — sourced differently by TYPE:
  // 'numeric' derives it from ratio/target (no separate flag is kept);
  // 'milestone' reads completed_at, which is set manually or automatically
  // once all milestones are done.
  isCompleted(goal: Goal): boolean {
    return goal.goal_type === 'numeric' ? this.progressRatio(goal) >= 1 : goal.completed_at != null;
  },

  // Only meaningful for 'milestone' goals (called either by a manual toggle or
  // automatically once all milestones are done — see app/goal/[id].tsx). For a
  // 'numeric' goal this is silently ignored: completion already comes from
  // current_value>=target_value.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'milestone') return;
    db.runSync(
      `UPDATE goals SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  // Re-derives current_value from entries for ALL goals.
  // Called after a sync pull finishes (see syncEngine.runSync): entries and/or
  // baseline arriving from remote may have changed the local total, and the
  // remote current_value itself (an old cache carried over via last-writer-
  // wins) doesn't SEE the other device's contribution — that mismatch was
  // exactly the source of the lost-progress bug (see migration019).
  //
  // Does NOT touch synced: this is a recompute from already-synced data, not a
  // user action. Otherwise every round would re-push all goals in an endless feedback loop.
  recomputeAllFromEntries(): void {
    const db = getDb();
    db.runSync(
      `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
         SELECT SUM(amount) FROM goal_entries
          WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
       ), 0))`
    );
  },

  // A goal's reminder rows are cleaned up here too (rationale: habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE goals SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
    reminderRepo.deleteAllForEntity('goal', id);
  },
};
