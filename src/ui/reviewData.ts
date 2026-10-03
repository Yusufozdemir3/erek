// Feeds the weekly review (lib/weeklyReview.ts) from the repos.

import { habitRepo, taskRepo } from '@/db';
import { toYmd } from '@/lib/helpers';
import { buildReview, WINDOW_DAYS, type Review } from '@/lib/weeklyReview';

export function loadReview(userId: string, today: string): Review {
  // Both windows (this week and the one before it) in one query each.
  const from = new Date(`${today}T00:00:00`);
  from.setDate(from.getDate() - (2 * WINDOW_DAYS - 1));
  const start = toYmd(from);

  const habits = habitRepo.listByUser(userId);
  return buildReview({
    habits,
    completed: habitRepo.completedDatesBetween(
      habits.map((h) => h.id),
      start,
      today
    ),
    taskDoneDates: taskRepo.completedDatesBetween(userId, start, today),
    today,
  });
}
