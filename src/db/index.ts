// The single entry point of the data layer.
// UI only ever imports from here:
//   import { db, taskRepo, habitRepo } from '@/db';

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

export { userRepo, taskRepo, subtaskRepo, habitRepo, goalRepo, goalMilestoneRepo, goalEntryRepo, milestoneViews, reminderRepo };
export type { MilestoneView } from './repositories/goalMilestoneRepo';
export type {
  User,
  Task,
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

// Called once at app startup. Sets up the schema, guarantees the anonymous user.
export async function initDataLayer() {
  await runMigrations();
  const user = userRepo.getOrCreateLocal();
  // Clean up expired tombstone records (see maintenance.ts). Must NEVER block
  // startup: the app failing to open because of a maintenance task would be
  // far worse than the problem it fixes.
  try {
    purgeOldTombstones();
  } catch (e) {
    console.warn('[DB] Failed to purge old tombstone records:', e);
  }
  return { user };
}
