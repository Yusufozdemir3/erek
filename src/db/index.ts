// The data layer's single entry point: import { taskRepo, habitRepo } from '@/db'.

import { runMigrations } from './database';
import { purgeOldTombstones } from './maintenance';
import { userRepo } from './repositories/userRepo';
import { taskRepo } from './repositories/taskRepo';
import { subtaskRepo } from './repositories/subtaskRepo';
import { habitRepo } from './repositories/habitRepo';
import { goalRepo } from './repositories/goalRepo';
import { goalMilestoneRepo, milestoneViews } from './repositories/goalMilestoneRepo';
import { goalEntryRepo } from './repositories/goalEntryRepo';
import { reminderRepo } from './repositories/reminderRepo';
import { tagRepo } from './repositories/tagRepo';

export { userRepo, taskRepo, subtaskRepo, habitRepo, goalRepo, goalMilestoneRepo, goalEntryRepo, milestoneViews, reminderRepo, tagRepo };
export type { MilestoneView } from './repositories/goalMilestoneRepo';
export type { GoalJustCompleted } from './repositories/habitRepo';
export type {
  User,
  Task,
  Tag,
  Subtask,
  Habit,
  Goal,
  GoalMilestone,
  GoalEntry,
  HabitLog,
  Recurrence,
  Priority,
  GoalType,
  HabitKind,
  GoalContribution,
  Reminder,
  ReminderEntityType,
} from '../types/models';

// Once at startup: schema, the local user, tombstone cleanup.
export async function initDataLayer() {
  await runMigrations();
  const user = userRepo.getOrCreateLocal();
  // Maintenance must never keep the app from opening.
  try {
    purgeOldTombstones();
  } catch (e) {
    console.warn('[DB] Failed to purge old tombstone records:', e);
  }
  return { user };
}
