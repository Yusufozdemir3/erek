// What ticking a subtask does to its parent task, shared by the edit modal and
// the inline checklist on the cards. Architecture rule: no SQL — repo calls only.

import { subtaskRepo, taskRepo } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { refreshTaskReminders } from '@/lib/notifications';

// All subtasks done completes the task; reopening or adding one reopens it.
export function syncTaskCompletionFromSubtasks(taskId: string): void {
  const { done, total } = subtaskRepo.countForTask(taskId);
  if (total === 0) return;
  const current = taskRepo.getById(taskId);
  if (!current) return;
  const shouldBeCompleted = done === total;
  const isCompleted = current.completed_at !== null;
  if (shouldBeCompleted && !isCompleted) {
    taskRepo.setCompleted(taskId, true);
    notifySuccess();
    // A recurring task may have moved instead.
    refreshTaskReminders(taskId);
  } else if (!shouldBeCompleted && isCompleted) {
    taskRepo.setCompleted(taskId, false);
    tapLight();
    refreshTaskReminders(taskId);
  }
}

// A pasted block becomes one subtask per non-empty line (list bullets and
// numbering stripped). A single line is just one subtask.
export function splitSubtaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}
