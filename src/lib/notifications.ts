// Local notification layer — wrapper around expo-notifications.
// Schedules a DAILY-repeating local notification based on each habit's remind_at time.
//
// Design decision: each notification's identifier is the habit's id. That
// makes scheduling/canceling deterministic and avoids needing to store a
// separate notification_id (a schema change). Rescheduling with the same id
// replaces the previous one.
//
// Architecture: this module is a side-effect layer; the UI calls it
// separately from repository calls. The single source of truth for data is
// still SQLite (habitRepo).
//
// KNOWN LIMITATION — iOS TRIGGER BUDGET (not yet solved):
// A reminder is not a SINGLE trigger: in weekly frequency it's one trigger
// per selected day (5 days = 5 triggers), and "every X days" schedules 8 of
// them. iOS caps pending local notifications at 64, and anything beyond that
// SILENTLY gets dropped — the user has no way to know why their reminder
// didn't fire. Android has no such hard cap.
// Current mitigation: the number of reminders per entity is capped (see
// ui/formLimits.MAX_REMINDERS_PER_ENTITY), which significantly shrinks the
// worst case. The FULL fix would be a GLOBAL scheduler that counts triggers
// across all entities and allocates the budget to the nearest-in-time ones;
// deliberately deferred since iOS hasn't shipped yet and the budget needs to
// be measured on a real device.
// This note must be addressed BEFORE iOS goes live.

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { goalRepo, habitRepo, reminderRepo, taskRepo } from '@/db';
import type { Goal, Habit, Reminder, Task } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate, toYmd } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { getNotificationPrefs, soundContent, type NotificationPrefs } from '@/lib/notificationPrefs';
import { ensureCustomSoundChannel } from '@/lib/customNotificationChannel';
import type { Lang } from '@/i18n/translations';

// Ensures the notification is shown even while the app is in the foreground.
// Set up once. The sound preference is also applied here (foreground
// notification); if the master switch is off, the alert is fully hidden (the
// schedule functions in the background already don't schedule one, but this
// handler is only for a notification that's already scheduled/incoming).
export function setNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const prefs = await getNotificationPrefs();
      return {
        shouldShowAlert: prefs.enabled,
        shouldPlaySound: prefs.enabled && prefs.sound,
        shouldSetBadge: false,
      };
    },
  });
}

// CHANNEL ARCHITECTURE (Android): on API 26+, sound and vibration are
// properties of the CHANNEL, not the notification, and once a channel is
// created it cannot be modified in code (only by the user via system
// settings). So we keep four separate channels for the four combinations of
// sound×vibration; each notification is routed to the right channel via
// channelIdFor based on the preference. When the preference changes, newly
// scheduled notifications go to the new channel (existing scheduled ones are
// moved via reschedule).
// (Deleting and recreating with the same id RESTORES the user's old setting
// on Android — so the four channels are permanent, and the choice is made at
// schedule time.)
const REMINDER_CHANNELS = {
  soundVibration: 'reminders-sv',
  soundOnly: 'reminders-s',
  vibrationOnly: 'reminders-v',
  silent: 'reminders-silent',
} as const;

const VIBRATION_PATTERN = [0, 250, 250, 250];

// Which channel to route to based on preference (only meaningful on Android).
// If a custom sound is selected (and sound is on), a channel bound to that URI
// is created/verified via the native module (see customNotificationChannel.ts);
// if the native module isn't available (Expo Go / not-yet-compiled build), it
// falls back to the fixed channels.
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

// A channel is required for notifications to display on Android. All four
// combination channels are set up on startup (idempotent). The old single
// 'habit-reminders' channel is cleaned up (no longer used; so it doesn't show
// up as a leftover in system settings).
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
  await Notifications.deleteNotificationChannelAsync('habit-reminders').catch(() => {});
}

// Requests permission (won't ask again if already granted). Returns true if granted.
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

// BATCH RESCHEDULE CONTEXT — only used in rescheduleAll* passes.
//
// Problem: every scheduleX call first does a cancelX, which pulls "ALL
// currently scheduled notifications" from the native bridge. On startup this
// was repeating separately for EVERY habit, EVERY task and EVERY goal that
// has a reminder — for a user with 80 entities, that's 80 full list scans +
// 80 preference reads + 80 language reads, all sequential. Once the context
// is built once and passed down, it drops to ONE per pass.
//
// The snapshot going "stale" is NOT a problem: each prefix belongs to exactly
// one entity and each entity is processed once per pass, so canceling an
// entity only looks for its PRE-EXISTING triggers — not ones we scheduled
// during this pass.
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

// Scans all scheduled notifications and cancels the ones whose identifier
// starts with the given prefix. Since MULTIPLE reminders each have their own
// id (plus extra suffixes for weekly/interval frequency), it's impossible to
// know in advance which ids might be scheduled — querying Expo's own records
// and deleting the ones matching the prefix is the only reliable way
// (symmetric to id generation when deleting subtasks/milestones: the same
// "wipe whatever's there, rebuild" pattern applies here too).
// If ctx is provided, the list isn't re-fetched (see RescheduleCtx).
async function cancelByPrefix(prefix: string, ctx?: RescheduleCtx): Promise<void> {
  const all = ctx?.scheduled ?? (await Notifications.getAllScheduledNotificationsAsync());
  const matching = all.filter((n) => n.identifier.startsWith(prefix));
  await Promise.all(
    matching.map(async (n) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      } catch {
        // may throw if there's no scheduled notification — harmless.
      }
    })
  );
}

// Schedules ALL reminders for a habit (0 or more times). Depending on
// frequency: every day means a single DAILY trigger per reminder; specific
// days means a separate WEEKLY trigger per reminder × per selected day;
// "every X days" means one-off DATE triggers per reminder for the upcoming
// scheduled days. Returns false if permission is missing (and at least one
// reminder would need to be scheduled).
export async function scheduleHabitReminders(
  habit: Habit,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  // First clear ALL old triggers for this habit (time/days/list may have
  // changed, or may have been removed entirely).
  await cancelHabitReminders(habit.id, ctx);

  if (reminders.length === 0) return true;

  // LIFETIME RANGE CHECK. Local notification triggers don't know about
  // start/end dates (DAILY/WEEKLY repeat forever), so the range is checked
  // here on every scheduling pass — both on save and on every batch reschedule.
  const today = todayDate();
  // Finished habit: not scheduled (the cancel above already cleared old ones).
  if (habit.end_date && habit.end_date < today) return true;
  // NOT-YET-STARTED habit: not scheduled. Used to only check the end date,
  // and a user who said "start on Sept 1" would get notifications starting
  // TODAY — even while the habit wasn't showing up in lists yet (useTodayData
  // already filters the same range), i.e. the app was contradicting itself.
  // Once the start day arrives, the batch reschedule kicks in (see
  // rescheduleEverything: runs on startup and at day rollover).
  if (habit.start_date && habit.start_date > today) return true;

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.habitReminders) return true; // user turned this type off

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
    if (!time) continue; // malformed time — skip silently
    const base = `habit:${habit.id}:${reminder.id}`;

    if (sched?.freq === 'interval') {
      // Expo has no repeating "every N days" trigger; the next 8 scheduled
      // days get one-off DATE triggers (base#i0..i7). Since rescheduleAllReminders
      // rebuilds from scratch on every startup, the window keeps sliding forward.
      const cursor = new Date(`${todayDate()}T00:00:00`);
      let scheduledCount = 0;
      for (let i = 0; scheduledCount < 8 && i < 1462; i++) {
        const ymd = toYmd(cursor);
        if (isScheduledOn(sched, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
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
      // Specific days: a separate weekly trigger per selected day.
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
      // Every day (no schedule, or daily).
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

// Cancels ALL reminders of a habit (regardless of how many, or which
// frequency suffix they were scheduled with — see cancelByPrefix).
export async function cancelHabitReminders(habitId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`habit:${habitId}:`, ctx);
}

// TIMER (habit kind='timer' or a duration-tracked goal): a one-off local
// notification announcing when the target duration is reached. identifier =
// `timer:${id}` (since habit/goal ids are UUIDs, sharing the namespace causes
// no collision; also doesn't collide with daily reminder ids). Scheduled when
// the timer starts; canceled on pause/finish/reset. Silently skipped if
// permission is missing (the timer still runs, there's just no notification).
export async function scheduleTimerDone(id: string, title: string, secondsFromNow: number): Promise<void> {
  await cancelTimerDone(id);
  if (secondsFromNow <= 0) return;
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.timerDone) return; // user turned this type off
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
    // may throw if there's no scheduled notification — harmless.
  }
}

// Reschedules all active reminders on startup.
// Since a device reboot / app update can clear scheduled notifications, they
// are rebuilt from the single source of truth (DB). Exits silently if
// permission is NOT granted, to avoid triggering the permission flow on startup.
export async function rescheduleAllReminders(habits: Habit[]): Promise<void> {
  const map = reminderRepo.mapByType('habit');
  const withReminder = habits.filter((h) => (map.get(h.id)?.length ?? 0) > 0);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return; // don't request permission on startup; asked when the user sets a time

  // Scan + preferences + language ONCE PER PASS (see RescheduleCtx).
  const ctx = await buildRescheduleCtx();
  for (const h of withReminder) {
    await scheduleHabitReminders(h, map.get(h.id) ?? [], ctx);
  }
}

// TASK reminder: schedules a one-off notification for EACH reminder time, ON
// the due date, at that time (identifier: `task:${id}:${reminderId}`, doesn't
// collide with habit/timer ids). The time is INDEPENDENT of the due date's own
// time. For tasks with no reminder, no due date, already completed, or whose
// reminder moment has passed, existing notifications are canceled and none are scheduled.
export async function scheduleTaskReminders(
  task: Task,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelTaskReminders(task.id, ctx);

  if (task.completed_at) return true;
  if (reminders.length === 0 || !task.due_date) return true; // no reminder or no due date

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.taskReminders) return true; // user turned this type off

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue; // malformed time — skip silently
    const when = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(when.getTime())) continue;
    when.setHours(time.hour, time.minute, 0, 0);
    if (when.getTime() <= Date.now()) continue; // reminder moment has passed

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

// Reschedules or cancels a task's reminders based on the CURRENT DB state.
// Why a separate function: on "complete" a recurring task might fast-forward
// to the next date INSTEAD of actually completing (see taskRepo.setCompleted),
// meaning the answer to "is this task now completed" can only be known by
// reading again AFTER the write. This logic had been copy-pasted verbatim as
// the same five lines across three screens (Today, Tasks, the edit sheet),
// and none of the four call sites handled the returned promise — rejecting it
// caused an "unhandled rejection".
//
// NEVER REJECTS UNDER ANY CONDITION: this is a side effect, and the user's
// checkbox action shouldn't appear to fail just because of the notification
// layer. Permission denial is also silent here (showing a permission warning
// on every checkbox toggle would be annoying — the warning only appears when
// the user DELIBERATELY changes a reminder, see the TaskForm/AddSheet save paths).
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

// GOAL reminder: schedules a daily "don't forget to log your goal"
// notification for EACH reminder time (identifier: `goal:${id}:${reminderId}`
// — doesn't collide with habit/task/timer ids). Not scheduled for a completed
// goal or one past its deadline; existing ones are canceled if present.
export async function scheduleGoalReminders(
  goal: Goal,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelGoalReminders(goal.id, ctx);

  if (reminders.length === 0) return true;
  if (goalRepo.isCompleted(goal)) return true; // no reminder for a completed goal
  if (goal.deadline && goal.deadline < todayDate()) return true; // deadline passed

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.goalReminders) return true; // user turned this type off

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue; // malformed time — skip silently
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

// Reschedules all goal reminders on startup (see rescheduleAllReminders).
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

// Reschedules all timed, incomplete, not-yet-overdue task reminders on
// startup (see rescheduleAllReminders — same rationale: a device/app restart
// can clear scheduled notifications).
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

// ONE-TIME MIGRATION: the old single remind_at schema (identifier = bare
// habitId / `task:${id}` / `goal:${id}`, with possible #weekday / #i{n}
// suffixes) DOESN'T MATCH the new multi-reminder prefix (`habit:${id}:${reminderId}`
// etc.) — the new cancelByPrefix would never find the old ones, leaving them
// permanently orphaned (they'd keep firing forever with stale content). So,
// once: all scheduled notifications get nuked; the rescheduleAll* calls that
// follow immediately after rebuild from the current DB state under the new
// schema (no data loss, only the OS's notification queue is cleared).
const MIGRATED_KEY = 'notif:migratedMultiReminder';
export async function migrateToMultiReminderIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATED_KEY);
  if (done) return;
  await cancelAllReminders();
  await AsyncStorage.setItem(MIGRATED_KEY, '1');
}

// REBUILDS THE REMINDERS OF ALL THREE ENTITY TYPES FROM THE CURRENT DB STATE.
//
// Why a single function: this same triple call was being repeated on startup
// (AppData), at day rollover (AppData's foreground trigger), and after
// account switching (LoginScreen); each of the three copies had its own error
// handling, and if one was forgotten it silently produced an "unhandled rejection".
//
// WHY IT ALSO NEEDS TO RUN AT DAY ROLLOVER: reminder validity depends on DATE
// (the habit's start/end date, the task's due date, the goal's deadline), but
// the scheduled OS triggers don't know about dates — DAILY/WEEKLY repeat
// forever. Rescheduling used to run ONLY on process restart; since Android
// keeps the process alive for days, a finished habit or an overdue goal could
// keep firing notifications for weeks (and a newly-started habit would never
// start firing either).
//
// NEVER REJECTS UNDER ANY CONDITION: this is a side-effect layer, it must not disrupt the caller's flow.
export async function rescheduleEverything(userId: string): Promise<void> {
  await rescheduleAllReminders(habitRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Alışkanlık hatırlatmaları kurulamadı:', e)
  );
  await rescheduleAllTaskReminders(taskRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Görev hatırlatmaları kurulamadı:', e)
  );
  await rescheduleAllGoalReminders(goalRepo.listByUser(userId)).catch((e) =>
    console.warn('[Bildirim] Hedef hatırlatmaları kurulamadı:', e)
  );
}

// Called after account merge/switch (see LoginScreen.onGoogle):
// reassignLocalIds (merge) gives ALL habit/task/goal/reminder rows NEW ids,
// clearLocalData (switch) DELETES them all and re-downloads — in both cases,
// triggers scheduled with the OLD ids in the OS's notification queue become
// orphaned: cancelHabitReminders(newId) can never find them, and they keep
// firing forever with stale content (duplicated). The same "nuke + rescheduleAll*
// rebuilds from current DB" pattern from migrateToMultiReminderIfNeeded above applies here too.
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // may throw if there's no permission/record at all — harmless, proceed.
  }
}
