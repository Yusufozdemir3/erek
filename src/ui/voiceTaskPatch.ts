// Turns a parsed sentence (lib/quickAdd) into changes for the task form.
// Only what the sentence mentioned is touched — a priority the user picked
// before tapping the mic survives a sentence that says nothing about it.
// Nothing here saves: the user still confirms with the form's own button.

import type { Priority } from '@/db';
import type { ParsedTask } from '@/lib/quickAdd/parseTask';
import { MAX_REMINDERS_PER_ENTITY, TITLE_MAX_LEN } from '@/ui/formLimits';

export interface VoicePatch {
  title?: string;
  titleTruncated: boolean; // the spoken title was longer than the field allows
  dueDate?: string; // "YYYY-MM-DD"
  dueTime?: string; // "HH:MM"
  priority?: Priority;
  remindTimes?: string[]; // the full new list
}

// "yarın annemi aramayı hatırlat" names a day but no time.
export const DEFAULT_REMIND_TIME = '09:00';

// Cuts at a word boundary instead of mid-word (the TextInput's maxLength
// would chop silently, so the form shows a note when this happens).
export function fitTitle(title: string, max: number = TITLE_MAX_LEN): { title: string; truncated: boolean } {
  if (title.length <= max) return { title, truncated: false };
  const head = title.slice(0, max + 1);
  const space = head.lastIndexOf(' ');
  const cut = space > max / 2 ? head.slice(0, space) : title.slice(0, max);
  return { title: cut.replace(/[\s,.;:!?…-]+$/, ''), truncated: true };
}

export function voicePatch(
  parsed: ParsedTask,
  current: { dueDate: string; remindTimes: string[] },
  today: string,
  maxReminders: number = MAX_REMINDERS_PER_ENTITY
): VoicePatch {
  const patch: VoicePatch = { titleTruncated: false };
  if (parsed.title) {
    const fit = fitTitle(parsed.title);
    patch.title = fit.title;
    patch.titleTruncated = fit.truncated;
  }
  if (parsed.date) patch.dueDate = parsed.date;
  if (parsed.time) patch.dueTime = parsed.time;
  if (parsed.priority) patch.priority = parsed.priority;
  if (parsed.remind) {
    // A reminder needs a time: the spoken one, or a morning default for a
    // later day. "Today" without a time is left to the user.
    const day = parsed.date ?? current.dueDate;
    const at = parsed.time ?? (day > today ? DEFAULT_REMIND_TIME : null);
    if (at && !current.remindTimes.includes(at) && current.remindTimes.length < maxReminders) {
      patch.remindTimes = [...current.remindTimes, at].sort();
    }
  }
  return patch;
}
