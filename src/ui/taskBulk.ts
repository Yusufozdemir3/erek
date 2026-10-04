// Bulk actions of the Tasks tab's selection mode: complete, move to tomorrow,
// delete. Each returns how many tasks it touched and one Undo that puts exactly
// those back. Only my own tasks take part (a task shared WITH me belongs to its
// owner), and each action skips what it can't do: finished tasks aren't
// completed twice, recurring tasks aren't re-dated here (they have their own rule).

import { taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime, shiftYmd } from '@/lib/helpers';
import { cancelTaskReminders, refreshTaskReminders, rescheduleEverything } from '@/lib/notifications';

export interface BulkResult {
  count: number;
  undo: () => void;
}

const mine = (tasks: Task[]) => tasks.filter((t) => !t.shared_owner_uid);

export function bulkComplete(tasks: Task[]): BulkResult {
  const open = mine(tasks).filter((t) => t.completed_at === null);
  for (const t of open) {
    taskRepo.setCompleted(t.id, true);
    refreshTaskReminders(t.id);
  }
  // A recurring task jumped to its next date instead of staying completed;
  // re-opening it would not move the date back, so it is not part of the Undo.
  const reopenable = open.filter((t) => !t.recurrence);
  return {
    count: open.length,
    undo: () => {
      for (const t of reopenable) {
        taskRepo.setCompleted(t.id, false);
        refreshTaskReminders(t.id);
      }
    },
  };
}

export function bulkPostpone(tasks: Task[], today: string): BulkResult {
  const movable = mine(tasks).filter((t) => t.completed_at === null && !t.recurrence);
  const before = new Map(movable.map((t) => [t.id, t.due_date]));
  const tomorrow = shiftYmd(today, 1);
  for (const t of movable) {
    // Keep the time of day, move only the date.
    const time = extractTime(t.due_date);
    taskRepo.update(t.id, { due_date: time ? `${tomorrow}T${time}:00` : tomorrow });
    refreshTaskReminders(t.id);
  }
  return {
    count: movable.length,
    undo: () => {
      for (const [id, due] of before) {
        taskRepo.update(id, { due_date: due });
        refreshTaskReminders(id);
      }
    },
  };
}

export function bulkDelete(tasks: Task[], userId: string): BulkResult {
  const own = mine(tasks);
  for (const t of own) {
    taskRepo.softDelete(t.id);
    cancelTaskReminders(t.id).catch((e) => console.warn('[Notification] Failed to cancel reminders for deleted task:', e));
  }
  return {
    count: own.length,
    undo: () => {
      for (const t of own) taskRepo.restore(t.id);
      rescheduleEverything(userId).catch(() => {});
    },
  };
}
