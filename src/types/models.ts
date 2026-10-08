// One type per table.

export type Priority = 'low' | 'medium' | 'high';
// 'numeric': current/target. 'milestone': split into steps (goal_milestones),
// completed by hand or when every step is done.
export type GoalType = 'numeric' | 'milestone';
// 'binary' = did / didn't; 'numeric' = amount target; 'timer' = target_amount
// and the log's amount in seconds.
export type HabitKind = 'binary' | 'numeric' | 'timer';

// Recurrence of tasks and habits (stored as JSON):
//   daily    → every day
//   weekly   → the given weekdays, or "X times a week" when none are given
//              (helpers.isQuotaSchedule)
//   monthly  → a day of the month
//   interval → every X days from anchor
//   yearly   → given dates every year
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'interval' | 'yearly';
  // for weekly: [1,3,5] = Mon, Wed, Fri (0=Sunday ... 6=Saturday)
  weekdays?: number[];
  // for a weekly quota (weekdays empty): times a week
  timesPerWeek?: number;
  // for monthly: day of the month (1-31)
  monthDay?: number;
  // for interval: every how many days (>=1)
  every?: number;
  // for interval: "YYYY-MM-DD", scheduled itself and every `every` days after
  anchor?: string;
  // for yearly: ["MM-DD", ...] (no year component)
  dates?: string[];
}

// Sync fields shared by all records.
export interface SyncFields {
  id: string;            // UUID, generated on the device
  updated_at: string;    // ISO 8601, last-writer-wins
  deleted_at: string | null; // set = soft-deleted
  synced: 0 | 1;         // 0 = waiting to be pushed
}

export interface User extends SyncFields {
  email: string | null;
  is_anonymous: 0 | 1;
}

export interface Task extends SyncFields {
  user_id: string;
  title: string;
  due_date: string | null;       // ISO 8601; if a time is embedded, it's the start/due time
  end_time: string | null;       // "HH:MM"; end time on the same day, null = none
  priority: Priority;
  recurrence: Recurrence | null; // null = one-off
  remind_at: string | null;      // unused since migration016 (reminders table)
  completed_at: string | null;   // null = not completed
  shared_with_id: string | null;   // owner side: the friend's cloud uid
  shared_owner_uid: string | null; // local only: set = someone's task shared with me (check-off only)
  icon: string | null;             // ui/taskIcons id; null = none
  tag_ids: string[];               // the user's tags; may hold ids of deleted tags (skip them)
}

// A user-made task label.
export interface Tag extends SyncFields {
  user_id: string;
  name: string;
  color: string | null; // a HABIT_COLORS value; null = the neutral default
  position: number;     // creation order
}

export interface Goal extends SyncFields {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value: number | null;   // for numeric: the target (e.g. 100 km)
  current_value: number;         // for numeric: current value (e.g. 40 km)
  unit: string | null;           // "km", "books", "hours"
  deadline: string | null;       // "YYYY-MM-DD"
  // 'milestone' goals only; numeric ones are done at current_value >= target_value.
  completed_at: string | null;
  remind_at: string | null;      // unused since migration016 (reminders table)
  start_date: string | null;     // "YYYY-MM-DD"; day zero of the pace (goalProjection.ts)
  // The part of current_value not made of entries (older progress, manual
  // corrections); current_value = this + live entries (migration019).
  value_baseline: number;
}

// A goal step:
//   'milestone' goal → a checklist item, ticked by hand (amount NULL);
//   numeric goal with amount → a threshold filled from current_value, never
//     ticked (goalMilestoneRepo.milestoneViews).
export interface GoalMilestone extends SyncFields {
  goal_id: string;
  title: string;
  completed: 0 | 1;
  position: number; // creation order = display order
  amount: number | null;   // numeric goals: the threshold
  due_date: string | null; // "YYYY-MM-DD", optional
}

// One progress amount added to a goal (manual, linked habit, timer, friend);
// current_value is derived from these (migration019).
export interface GoalEntry extends SyncFields {
  goal_id: string;
  amount: number; // negative = a correction
  // A contributing friend's cloud uid; null = the owner.
  added_by: string | null;
}

// How a linked habit feeds its goal: 'per_completion' = +1 per completed day
// (always for binary); 'amount' = the day's amount × goal_factor. NULL = per_completion.
export type GoalContribution = 'per_completion' | 'amount';

export interface Habit extends SyncFields {
  user_id: string;
  goal_id: string | null;
  title: string;
  kind: HabitKind;
  remind_at: string | null;      // unused since migration016 (reminders table)
  icon: string | null;           // icon id, null = none
  color: string | null;          // "#rrggbb", null = default
  schedule: Recurrence | null;   // null = every day
  target_amount: number | null;  // numeric: daily amount · timer: seconds · binary: null
  unit: string | null;           // numeric only ("glasses", "pages")
  start_date: string | null;     // "YYYY-MM-DD"; null = unbounded
  end_date: string | null;       // "YYYY-MM-DD"; null = unbounded
  skip_dates?: string[] | null;  // rest days, treated as unscheduled
  goal_contribution: GoalContribution | null;
  goal_factor: number;           // 'amount' mode multiplier; default 1
}

// A checklist item under a task: just a title and a tick.
export interface Subtask extends SyncFields {
  task_id: string;
  title: string;
  completed: 0 | 1;
  position: number; // creation order = display order
}

// Any number of reminder times per habit/task/goal (reminderRepo).
export type ReminderEntityType = 'habit' | 'task' | 'goal';

export interface Reminder extends SyncFields {
  entity_type: ReminderEntityType;
  entity_id: string;
  time: string; // "HH:MM"
}

// A habit's state on one day; streaks and stats are computed from these.
export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;     // "YYYY-MM-DD"
  completed: 0 | 1;     // numeric/timer: amount >= target
  amount: number;       // the day's amount (0 for binary)
  updated_at: string;
}
