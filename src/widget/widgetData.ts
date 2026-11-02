// Keeps the native home-screen widgets in step with the app: publishes their
// board (refreshWidget) and books their queued taps into SQLite
// (drainWidgetQueue).

import { Platform } from 'react-native';
import { habitRepo, reminderRepo, taskRepo } from '@/db';
import { getStoredLang } from '@/i18n/I18nProvider';
import { parseTask } from '@/lib/quickAdd/parseTask';
import { refreshTaskReminders, scheduleGeneralReminders, scheduleTaskReminders } from '@/lib/notifications';
import { voicePatch } from '@/ui/voiceTaskPatch';
import { appendPending, readPending, removePending, serialized } from './widgetQueue';
import { consumeNativeWidgetActions, publishNativeBoard } from './nativeWidgets';

// Publishes the native widgets' board. Never throws. Taps not yet drained into
// SQLite are laid over the fresh board, so a refresh never "un-checks" what the
// user just tapped.
export async function refreshWidget(userId: string): Promise<void> {
  // Called after every check-off and data change, which is also when the
  // general reminder's "anything left today?" answer can change.
  scheduleGeneralReminders(userId).catch(() => {});
  if (Platform.OS !== 'android') return;
  try {
    const pending = await serialized(readPending);
    await publishNativeBoard(userId, pending);
  } catch {
    // leave the widgets as they are
  }
}

// "yarın 14:00 doktor" typed into the quick-add card: the same sentence rules as the
// microphone on the task form (date, time, priority, "hatırlat" in the words).
async function createQuickTask(userId: string, text: string, today: string): Promise<boolean> {
  const lang = await getStoredLang();
  const patch = voicePatch(parseTask(text, lang, new Date()), { dueDate: today, remindTimes: [] }, today);
  const title = (patch.title ?? text).trim();
  if (!title) return false;
  const day = patch.dueDate ?? today;
  const created = taskRepo.create({
    user_id: userId,
    title,
    priority: patch.priority ?? 'medium',
    due_date: patch.dueTime ? `${day}T${patch.dueTime}:00` : day,
  });
  const reminders = reminderRepo.replaceAll('task', created.id, patch.remindTimes ?? []);
  if (reminders.length > 0) await scheduleTaskReminders(created, reminders).catch(() => false);
  return true;
}

// Writes the queued widget taps into SQLite (widgetQueue.ts) and returns how
// many changed something. Taps for deleted or changed habits are dropped. The
// native button widgets' taps join the JS queue first (nativeWidgets.ts).
// `userId` lets it create the tasks typed into the Hızlı görev card; without it
// those wait in the queue.
// Never await it inside serialized() — it takes the same chain.
export async function drainWidgetQueue(userId?: string): Promise<number> {
  return serialized(async () => {
    for (const a of consumeNativeWidgetActions()) await appendPending(a);
    const pending = await readPending();
    let applied = 0;
    const waiting = new Set<string>();
    for (const a of pending) {
      try {
        if (a.kind === 'taskAdd') {
          if (!userId) {
            waiting.add(a.id);
            continue;
          }
          if (await createQuickTask(userId, a.title, a.date)) applied++;
          continue;
        }
        if (a.kind === 'task') {
          const task = taskRepo.getById(a.taskId);
          // Someone else's shared task is checked off through the server, never here.
          if (!task || task.shared_owner_uid) continue;
          taskRepo.setCompleted(task.id, a.completed);
          // A recurring task jumps to its next date instead of staying completed.
          await refreshTaskReminders(task.id).catch(() => {});
          applied++;
          continue;
        }
        const habit = habitRepo.getById(a.habitId);
        if (!habit || habit.deleted_at) continue;
        if (a.kind === 'toggle' && habit.kind === 'binary') {
          habitRepo.toggleLog(habit.id, a.date, a.completed);
          applied++;
        } else if (a.kind === 'inc' && habit.kind === 'numeric') {
          habitRepo.incrementAmount(habit.id, a.date, a.delta, habit.target_amount);
          applied++;
        }
      } catch {
        // a bad entry is dropped without blocking the rest
      }
    }
    await removePending(pending.filter((a) => !waiting.has(a.id)).map((a) => a.id));
    return applied;
  });
}
