// Pure parts of the setup wizard (no React, no native modules): which steps
// there are, the suggestion lists, and the small date maths — testable in the
// Node project (see __tests__/wizardLogic.test.ts).

import type { Recurrence } from '@/types/models';
import { toYmd } from '@/lib/helpers';

export type StepId =
  | 'welcome'
  | 'look'
  | 'habit'
  | 'task'
  | 'goal'
  | 'notifications'
  | 'widget'
  | 'account'
  | 'done';

// What the device/build can do decides which steps exist. A step that can't
// work is left out entirely rather than shown disabled.
export interface WizardCapabilities {
  accounts: boolean; // sign-in is configured (ACCOUNTS_ENABLED + Google + sync)
  widget: boolean; // Android home-screen widget
}

export function buildSteps(cap: WizardCapabilities): StepId[] {
  const steps: StepId[] = ['welcome', 'look', 'habit', 'task', 'goal', 'notifications'];
  if (cap.widget) steps.push('widget');
  if (cap.accounts) steps.push('account');
  steps.push('done');
  return steps;
}

// Steps that can be skipped one by one. Welcome and the closing page can't:
// they're the frame, and "skip everything" is its own button.
export const SKIPPABLE: ReadonlySet<StepId> = new Set<StepId>([
  'look', 'habit', 'task', 'goal', 'notifications', 'widget', 'account',
]);

export type StepOutcome = 'done' | 'skipped';
export type Outcomes = Partial<Record<StepId, StepOutcome>>;

// The open form on a habit/task/goal page, as the shell sees it. "Continue"
// saves a ready form; a half-filled one would be lost, so it blocks.
export interface FormStatus {
  ready: boolean; // enough to save (a title; for a goal also a target)
  dirty: boolean; // anything typed at all
}

// An empty form blocks only until something was added on the page; leaving
// without adding anything is what "Skip this step" is for.
export function continueBlocked(form: FormStatus | null, completed: boolean): boolean {
  if (!form) return false;
  return form.dirty ? !form.ready : !completed;
}

// "Step 3 of 8" counts only the real steps (not welcome / closing page).
export function progress(steps: StepId[], index: number): { current: number; total: number } | null {
  const real: StepId[] = steps.filter((s) => s !== 'welcome' && s !== 'done');
  const id = steps[index];
  const at = real.indexOf(id);
  return at < 0 ? null : { current: at + 1, total: real.length };
}

// ---- Habit step -------------------------------------------------------------

export type HabitFrequency = 'daily' | 'weekdays' | 'threePerWeek';

export function scheduleFor(freq: HabitFrequency): Recurrence | null {
  switch (freq) {
    case 'daily':
      return null;
    case 'weekdays':
      return { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] };
    case 'threePerWeek':
      return { freq: 'weekly', weekdays: [], timesPerWeek: 3 };
  }
}

// Reminder times offered in the habit step; null = no reminder.
export const REMINDER_PRESETS: (string | null)[] = [null, '08:00', '12:00', '18:00', '21:00'];

// ---- Goal step --------------------------------------------------------------

export const DEADLINE_PRESET_DAYS = [30, 90, 180, 365] as const;

// "YYYY-MM-DD", `days` after `from` (local calendar days, DST-safe).
export function deadlineIn(days: number, from: Date = new Date()): string {
  return toYmd(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days));
}

// A positive, sane number from a text field; null otherwise.
export function parseTarget(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 && n <= 999_999_999 ? n : null;
}

// ---- Task step --------------------------------------------------------------

// What the task step hands to taskRepo.create: date with the time embedded
// the way the app stores it ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:00").
export function dueDateOf(date: string | null, time: string | null, today: string): string {
  const day = date ?? today;
  return time ? `${day}T${time}:00` : day;
}

// ---- Summary ----------------------------------------------------------------

export interface Created {
  habit?: string;
  task?: string;
  goal?: string;
}

// What the closing page lists: only real things the user made or switched on.
export interface SummaryLine {
  key: 'habit' | 'task' | 'goal' | 'notifications' | 'account';
  text?: string; // the created item's title
}

export function summaryLines(created: Created, outcomes: Outcomes, notificationsOn: boolean, signedIn: boolean): SummaryLine[] {
  const lines: SummaryLine[] = [];
  if (created.habit) lines.push({ key: 'habit', text: created.habit });
  if (created.task) lines.push({ key: 'task', text: created.task });
  if (created.goal) lines.push({ key: 'goal', text: created.goal });
  if (notificationsOn && outcomes.notifications === 'done') lines.push({ key: 'notifications' });
  if (signedIn && outcomes.account === 'done') lines.push({ key: 'account' });
  return lines;
}
