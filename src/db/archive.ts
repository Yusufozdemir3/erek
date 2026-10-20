// Automatic archive (migration024). Whether a row is archived is derived from
// its own data at query time, so nothing has to run at launch/foreground and
// every device agrees after a sync. Each fragment takes ONE parameter: today
// as local "YYYY-MM-DD" (todayDate()), and is 0/1, never NULL (COALESCE), so
// NOT(...) also keeps rows with odd dates.
//
// unarchived_at is the user's "Restore": an item restored after it was
// completed (or ended) stays out until it is completed (ends) again.

// Tasks: one-off, completed at least 7 days ago. Recurring ones never are —
// completing them moves them to the next date.
const TASK_ARCHIVED = `COALESCE((
  recurrence IS NULL AND completed_at IS NOT NULL
  AND date(completed_at, 'localtime') <= date(?, '-7 days')
  AND (unarchived_at IS NULL OR julianday(unarchived_at) < julianday(completed_at))
), 0)`;

// Goals: completed on an earlier day (the completion day stays visible). A
// numeric goal must still be at its target; completed_at follows it (goalRepo).
const GOAL_ARCHIVED = `COALESCE((
  completed_at IS NOT NULL
  AND date(completed_at, 'localtime') < ?
  AND (goal_type <> 'numeric' OR (target_value > 0 AND current_value >= target_value))
  AND (unarchived_at IS NULL OR julianday(unarchived_at) < julianday(completed_at))
), 0)`;

// Habits: end_date has passed. Restored after the end -> kept until the end
// date is moved past the restore day and passes again.
const HABIT_ARCHIVED = `COALESCE((
  end_date IS NOT NULL AND end_date < ?
  AND (unarchived_at IS NULL OR end_date >= date(unarchived_at, 'localtime'))
), 0)`;

export const archiveSql = {
  task: { archived: `${TASK_ARCHIVED} = 1`, active: `${TASK_ARCHIVED} = 0` },
  goal: { archived: `${GOAL_ARCHIVED} = 1`, active: `${GOAL_ARCHIVED} = 0` },
  habit: { archived: `${HABIT_ARCHIVED} = 1`, active: `${HABIT_ARCHIVED} = 0` },
};

export type ArchiveKind = keyof typeof archiveSql;
