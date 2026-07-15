// Veri katmanının tek giriş noktası.
// UI sadece buradan import eder:
//   import { db, taskRepo, habitRepo } from '@/db';

import { runMigrations } from './database';
import { userRepo } from './repositories/userRepo';
import { taskRepo } from './repositories/taskRepo';
import { subtaskRepo } from './repositories/subtaskRepo';
import { habitRepo } from './repositories/habitRepo';
import { goalRepo } from './repositories/goalRepo';
import { goalMilestoneRepo } from './repositories/goalMilestoneRepo';
import { goalEntryRepo } from './repositories/goalEntryRepo';

export { userRepo, taskRepo, subtaskRepo, habitRepo, goalRepo, goalMilestoneRepo, goalEntryRepo };
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
} from '../types/models';

// Uygulama açılışında bir kez çağrılır. Şemayı kurar, anonim kullanıcıyı garantiler.
export async function initDataLayer() {
  await runMigrations();
  const user = userRepo.getOrCreateLocal();
  return { user };
}
