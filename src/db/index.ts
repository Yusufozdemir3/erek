// Veri katmanının tek giriş noktası.
// UI sadece buradan import eder:
//   import { db, taskRepo, habitRepo } from '@/db';

import { runMigrations } from './database';
import { userRepo } from './repositories/userRepo';
import { taskRepo } from './repositories/taskRepo';
import { subtaskRepo } from './repositories/subtaskRepo';
import { habitRepo } from './repositories/habitRepo';
import { goalRepo } from './repositories/goalRepo';

export { userRepo, taskRepo, subtaskRepo, habitRepo, goalRepo };
export type { User, Task, Subtask, Habit, Goal, HabitLog, Recurrence, Priority, GoalType } from '../types/models';

// Uygulama açılışında bir kez çağrılır. Şemayı kurar, anonim kullanıcıyı garantiler.
export async function initDataLayer() {
  await runMigrations();
  const user = userRepo.getOrCreateLocal();
  return { user };
}
