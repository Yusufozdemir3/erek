// Local notifications (expo-notifications) for habit, task and goal reminders,
// the timer and the weekly review. SQLite is the source of truth; these
// functions only mirror it into the OS queue.
//
// Identifiers are derived from the data (`habit:<id>:<reminderId>`, …), so no
// notification id is stored and an entity's triggers are found by prefix.
//
// iOS (not shipped yet) caps pending notifications at 64 and silently drops
// the rest; weekly and interval schedules use several triggers per reminder.
// Capping reminders per entity (formLimits) only shrinks the worst case — a
// global budget is needed before an iOS release.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { goalRepo, habitRepo, reminderRepo, taskRepo } from '@/db';
import type { Goal, Habit, Reminder, ReminderEntityType, Task } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate, toYmd } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { getNotificationPrefs, soundContent, type NotificationPrefs } from '@/lib/notificationPrefs';
import { ensureCustomSoundChannel } from '@/lib/customNotificationChannel';
import { isNudgeData, NUDGE_CHANNEL_ID, parseNudgeData } from '@/lib/nudgePayload';
import { nudgeRecipientUid } from '@/lib/nudgeRecipient';
import type { Lang } from '@/i18n/translations';

// Foreground presentation: honors the master switch and the sound preference.
export function setNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      // Never show a nudge meant for another account signed in here before.
      // Background ones bypass this; the token handover covers them (sync/pushTokens.ts).
      const data = notification.request.content.data;
      if (isNudgeData(data) && !parseNudgeData(data, nudgeRecipientUid())) {
        return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      const prefs = await getNotificationPrefs();
      return {
        shouldShowBanner: prefs.enabled,
        shouldShowList: prefs.enabled,
        shouldPlaySound: prefs.enabled && prefs.sound,
        shouldSetBadge: false,
      };
    },
  });
}

// On Android, sound and vibration belong to the CHANNEL and can't be changed
// after creation (recreating an id even restores the old settings). So there
// is one permanent channel per sound×vibration combination, picked at schedule time.
const REMINDER_CHANNELS = {
  soundVibration: 'reminders-sv',
  soundOnly: 'reminders-s',
  vibrationOnly: 'reminders-v',
  silent: 'reminders-silent',
} as const;

const VIBRATION_PATTERN = [0, 250, 250, 250];

// A custom sound gets its own channel via the native module
// (customNotificationChannel.ts); without the module, the fixed channels.
function channelIdFor(prefs: NotificationPrefs, lang: Lang): string {
  if (prefs.sound && prefs.customSoundUri) {
    const name = translate(lang, prefs.vibration ? 'notif.channelCustomSoundVibration' : 'notif.channelCustomSound');
    const id = ensureCustomSoundChannel(prefs.customSoundUri, prefs.vibration, name);
    if (id) return id;
  }
  if (prefs.sound && prefs.vibration) return REMINDER_CHANNELS.soundVibration;
  if (prefs.sound) return REMINDER_CHANNELS.soundOnly;
  if (prefs.vibration) return REMINDER_CHANNELS.vibrationOnly;
  return REMINDER_CHANNELS.silent;
}

// Creates the channels at startup (idempotent) and removes retired ones.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const lang = await getStoredLang();
  const base = {
    name: translate(lang, 'notif.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
  };
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.soundVibration, {
    ...base,
    name: translate(lang, 'notif.channelSoundVibration'),
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: VIBRATION_PATTERN,
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.soundOnly, {
    ...base,
    name: translate(lang, 'notif.channelSoundOnly'),
    sound: 'default',
    enableVibrate: false,
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.vibrationOnly, {
    ...base,
    name: translate(lang, 'notif.channelVibrationOnly'),
    sound: null,
    enableVibrate: true,
    vibrationPattern: VIBRATION_PATTERN,
  });
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNELS.silent, {
    ...base,
    name: translate(lang, 'notif.channelSilent'),
    sound: null,
    enableVibrate: false,
  });
  // Friend nudges: their own channel, silenced separately from reminders.
  await Notifications.setNotificationChannelAsync(NUDGE_CHANNEL_ID, {
    name: translate(lang, 'notif.channelFriends'),
    importance: Notifications.AndroidImportance.HIGH,
    // The text names a habit/goal: hidden on the lock screen.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: VIBRATION_PATTERN,
  });
  await Notifications.deleteNotificationChannelAsync('habit-reminders').catch(() => {});
  await Notifications.deleteNotificationChannelAsync('friend-nudge').catch(() => {});
}

// Reads the permission WITHOUT asking. canAskAgain=false: only system settings can change it.
export async function notificationPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return { granted: p.granted, canAskAgain: p.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: true };
  }
}

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

// "08:30" -> { hour: 8, minute: 30 }; null if invalid.
function parseHm(hm: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// Read once per rescheduleAll* pass instead of once per entity (the full
// scheduled list, prefs, language). The list going stale during the pass is
// fine: each entity is visited once and only cancels its pre-existing triggers.
interface RescheduleCtx {
  scheduled: { identifier: string }[];
  prefs: NotificationPrefs;
  lang: Lang;
}

async function buildRescheduleCtx(): Promise<RescheduleCtx> {
  const [scheduled, prefs, lang] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    getNotificationPrefs(),
    getStoredLang(),
  ]);
  return { scheduled, prefs, lang };
}

// Cancels every trigger whose id starts with the prefix — the ids depend on
// reminders and schedule suffixes, so the OS list is the only reliable record.
async function cancelByPrefix(prefix: string, ctx?: RescheduleCtx): Promise<void> {
  const all = ctx?.scheduled ?? (await Notifications.getAllScheduledNotificationsAsync());
  const matching = all.filter((n) => n.identifier.startsWith(prefix));
  await Promise.all(
    matching.map(async (n) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      } catch {
        // already gone
      }
    })
  );
}

// Per reminder: one DAILY trigger, a WEEKLY one per selected weekday, or
// one-off DATE triggers for the next interval days. false = no permission.
export async function scheduleHabitReminders(
  habit: Habit,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelHabitReminders(habit.id, ctx);

  if (reminders.length === 0) return true;

  // Triggers repeat forever, so the lifespan is enforced here on every pass
  // (rescheduleEverything also runs at day rollover).
  const today = todayDate();
  if (habit.end_date && habit.end_date < today) return true;
  if (habit.start_date && habit.start_date > today) return true;

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.habitReminders) return true; // turned off by the user

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
  const channelId = channelIdFor(prefs, lang);
  const content = {
    title: translate(lang, 'notif.reminderTitle'),
    body: habit.title,
    ...soundContent(prefs),
  };
  const sched = habit.schedule;
  const weekdays = sched && sched.freq === 'weekly' ? sched.weekdays ?? [] : [];

  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue;
    const base = `habit:${habit.id}:${reminder.id}`;

    if (sched?.freq === 'interval') {
      // No repeating "every N days" trigger exists: the next 8 scheduled days
      // get one-off triggers, and each reschedule slides the window forward.
      const cursor = new Date(`${todayDate()}T00:00:00`);
      let scheduledCount = 0;
      for (let i = 0; scheduledCount < 8 && i < 1462; i++) {
        const ymd = toYmd(cursor);
        if (isScheduledOn(sched, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd, habit.skip_dates)) {
          const when = new Date(`${ymd}T00:00:00`);
          when.setHours(time.hour, time.minute, 0, 0);
          if (when.getTime() > Date.now()) {
            await Notifications.scheduleNotificationAsync({
              identifier: `${base}#i${scheduledCount}`,
              content,
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId },
            });
            scheduledCount++;
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    } else if (weekdays.length > 0) {
      for (const wd of weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${base}#${wd}`,
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: wd + 1, // expo: 1=Sunday ... 7=Saturday (JS getDay 0=Sunday)
            hour: time.hour,
            minute: time.minute,
            channelId,
          },
        });
      }
    } else {
      await Notifications.scheduleNotificationAsync({
        identifier: base,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: time.hour,
          minute: time.minute,
          channelId,
        },
      });
    }
  }
  return true;
}

export async function cancelHabitReminders(habitId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`habit:${habitId}:`, ctx);
}

// "Target reached" for a running timer (habit or goal), scheduled on start and
// cancelled on pause/finish/reset. Without permission the timer just runs silently.
export async function scheduleTimerDone(id: string, title: string, secondsFromNow: number): Promise<void> {
  await cancelTimerDone(id);
  if (secondsFromNow <= 0) return;
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.timerDone) return;
  const granted = await ensurePermission();
  if (!granted) return;
  const lang = await getStoredLang();
  await Notifications.scheduleNotificationAsync({
    identifier: `timer:${id}`,
    content: {
      title: translate(lang, 'notif.timerDoneTitle'),
      body: translate(lang, 'notif.timerDoneBody', { title }),
      ...soundContent(prefs),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.ceil(secondsFromNow)),
      channelId: channelIdFor(prefs, lang),
    },
  });
}

export async function cancelTimerDone(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`timer:${id}`);
  } catch {
    // already gone
  }
}

// Rebuilds habit reminders from the DB (a reboot or update can clear the OS
// queue). Without permission it does nothing — startup never asks.
export async function rescheduleAllReminders(habits: Habit[]): Promise<void> {
  const map = reminderRepo.mapByType('habit');
  const withReminder = habits.filter((h) => (map.get(h.id)?.length ?? 0) > 0);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const ctx = await buildRescheduleCtx();
  for (const h of withReminder) {
    await scheduleHabitReminders(h, map.get(h.id) ?? [], ctx);
  }
}

// One notification per reminder time on the due date (independent of the
// due time). Nothing for completed or date-less tasks or a past moment.
export async function scheduleTaskReminders(
  task: Task,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelTaskReminders(task.id, ctx);

  if (task.completed_at) return true;
  if (reminders.length === 0 || !task.due_date) return true;

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.taskReminders) return true;

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue;
    const when = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(when.getTime())) continue;
    when.setHours(time.hour, time.minute, 0, 0);
    if (when.getTime() <= Date.now()) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `task:${task.id}:${reminder.id}`,
      content: {
        title: translate(lang, 'notif.taskReminderTitle'),
        body: task.title,
        ...soundContent(prefs),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId,
      },
    });
  }
  return true;
}

export async function cancelTaskReminders(taskId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`task:${taskId}:`, ctx);
}

// Re-reads the task after a write (completing a recurring task moves it
// instead) and schedules or cancels accordingly. Never rejects and never asks
// for permission: a check-off must not fail or nag because of notifications.
export async function refreshTaskReminders(taskId: string): Promise<void> {
  try {
    const task = taskRepo.getById(taskId);
    if (task && task.completed_at === null) {
      await scheduleTaskReminders(task, reminderRepo.listByEntity('task', task.id));
    } else {
      await cancelTaskReminders(taskId);
    }
  } catch (e) {
    console.warn('[Bildirim] Görev hatırlatmaları güncellenemedi:', e);
  }
}

// A daily "log your goal" per reminder time; none once completed or past the deadline.
export async function scheduleGoalReminders(
  goal: Goal,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelGoalReminders(goal.id, ctx);

  if (reminders.length === 0) return true;
  if (goalRepo.isCompleted(goal)) return true;
  if (goal.deadline && goal.deadline < todayDate()) return true;

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.goalReminders) return true;

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `goal:${goal.id}:${reminder.id}`,
      content: {
        title: translate(lang, 'notif.goalReminderTitle'),
        body: translate(lang, 'notif.goalReminderBody', { title: goal.title }),
        ...soundContent(prefs),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId,
      },
    });
  }
  return true;
}

export async function cancelGoalReminders(goalId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`goal:${goalId}:`, ctx);
}

export async function rescheduleAllGoalReminders(goals: Goal[]): Promise<void> {
  const map = reminderRepo.mapByType('goal');
  const withReminder = goals.filter((g) => (map.get(g.id)?.length ?? 0) > 0);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const ctx = await buildRescheduleCtx();
  for (const g of withReminder) {
    await scheduleGoalReminders(g, map.get(g.id) ?? [], ctx);
  }
}

export async function rescheduleAllTaskReminders(tasks: Task[]): Promise<void> {
  const map = reminderRepo.mapByType('task');
  const withTime = tasks.filter((t) => !t.completed_at && t.due_date && (map.get(t.id)?.length ?? 0) > 0);
  if (withTime.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const ctx = await buildRescheduleCtx();
  for (const t of withTime) {
    await scheduleTaskReminders(t, map.get(t.id) ?? [], ctx);
  }
}

// One-time: triggers from the single-reminder era have ids no prefix matches
// and would fire forever, so the queue is cleared once and rebuilt from the DB.
const MIGRATED_KEY = 'notif:migratedMultiReminder';
export async function migrateToMultiReminderIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATED_KEY);
  if (done) return;
  await cancelAllReminders();
  await AsyncStorage.setItem(MIGRATED_KEY, '1');
}

// Cancels habit/task/goal triggers with no live (entity, reminder) left in the
// DB — e.g. deleted or completed on another device, which no local handler
// saw. Needs no permission. Other ids (timer:, weekly-review) are left alone.
const REMINDER_PREFIX = /^(habit|task|goal):([^:]+):([^#]+)/;

export async function sweepOrphanReminders(userId: string): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (scheduled.length === 0) return 0;

  const live = new Set<string>();
  const add = (type: ReminderEntityType, ids: Iterable<string>) => {
    const map = reminderRepo.mapByType(type);
    for (const id of ids) for (const r of map.get(id) ?? []) live.add(`${type}:${id}:${r.id}`);
  };
  add('habit', habitRepo.listByUser(userId).map((h) => h.id));
  // Completed or date-less tasks never have triggers.
  add('task', taskRepo.listByUser(userId).filter((t) => !t.completed_at && t.due_date).map((t) => t.id));
  add('goal', goalRepo.listByUser(userId).map((g) => g.id));

  const orphans = scheduled
    .map((n) => n.identifier)
    .filter((id) => {
      const m = REMINDER_PREFIX.exec(id);
      return m != null && !live.has(`${m[1]}:${m[2]}:${m[3]}`);
    });
  await Promise.all(
    orphans.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
  return orphans.length;
}

// Weekly review, Sundays 19:00, opt-in. Fixed text (no user data), so it
// never goes stale. false only when it's on but permission is missing.
export const WEEKLY_REVIEW_ID = 'weekly-review';
const WEEKLY_REVIEW_WEEKDAY = 1; // expo: 1 = Sunday
const WEEKLY_REVIEW_HOUR = 19;

export async function scheduleWeeklyReview(): Promise<boolean> {
  try {
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_ID).catch(() => {});
    const prefs = await getNotificationPrefs();
    if (!prefs.enabled || !prefs.weeklyReview) return true;
    if (!(await ensurePermission())) return false;
    const lang = await getStoredLang();
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_REVIEW_ID,
      content: {
        title: translate(lang, 'notif.weeklyReviewTitle'),
        body: translate(lang, 'notif.weeklyReviewBody'),
        ...soundContent(prefs),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: WEEKLY_REVIEW_WEEKDAY,
        hour: WEEKLY_REVIEW_HOUR,
        minute: 0,
        channelId: channelIdFor(prefs, lang),
      },
    });
    return true;
  } catch (e) {
    console.warn('[Bildirim] Haftalık özet bildirimi kurulamadı:', e);
    return false;
  }
}

// Rebuilds every reminder from the DB: at startup, at day rollover (validity
// depends on dates the OS triggers don't know, and Android keeps the process
// alive for days) and after an account change. Never rejects.
export async function rescheduleEverything(userId: string): Promise<void> {
  await sweepOrphanReminders(userId).catch((e) =>
    console.warn('[Bildirim] Yetim hatırlatmalar temizlenemedi:', e)
  );
  await rescheduleAllReminders(habitRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Alışkanlık hatırlatmaları kurulamadı:', e)
  );
  await rescheduleAllTaskReminders(taskRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Görev hatırlatmaları kurulamadı:', e)
  );
  await rescheduleAllGoalReminders(goalRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Hedef hatırlatmaları kurulamadı:', e)
  );
  await scheduleWeeklyReview();
}

// After ids change or data is wiped (account merge/switch, sign-out), old
// triggers can't be found by prefix anymore: clear everything, then rebuild.
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // nothing to cancel
  }
}
