// Yerel bildirim katmanı — expo-notifications sarmalayıcısı.
// Alışkanlıkların remind_at saatine göre GÜNLÜK tekrarlayan yerel bildirim kurar.
//
// Tasarım kararı: her bildirimin identifier'ı alışkanlığın id'sidir. Böylece
// programlama/iptal deterministiktir ve ayrı bir notification_id saklamaya
// (şema değişikliği) gerek kalmaz. Aynı id ile yeniden programlamak öncekini değiştirir.
//
// Mimari: bu modül bir yan etki katmanıdır; UI bunu repository çağrılarından
// ayrı olarak çağırır. Veri için tek doğru kaynak yine SQLite (habitRepo).

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { goalRepo } from '@/db';
import type { Goal, Habit, Task } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate, toYmd } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { getNotificationPrefs, soundContent } from '@/lib/notificationPrefs';

// Uygulama ön plandayken de bildirimin görünmesini sağlar. Bir kez kurulur.
// Ses tercihi burada da (ön plan bildirimi) uygulanır; ana anahtar kapalıysa
// uyarı tamamen gizlenir (arka plandaki schedule fonksiyonları zaten kurmaz,
// ama bu handler yalnızca zaten kurulmuş/gelen bir bildirim içindir).
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

// Android'de bildirimlerin gösterilebilmesi için bir kanal şarttır. Açılışta kurulur.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const lang = await getStoredLang();
  await Notifications.setNotificationChannelAsync('habit-reminders', {
    name: translate(lang, 'notif.channelName'),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// İzin ister (zaten verilmişse tekrar sormaz). Verildiyse true döner.
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

// "08:30" -> { hour: 8, minute: 30 }; geçersizse null.
function parseHm(hm: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

// Bir alışkanlık için hatırlatmayı kurar. remind_at yoksa varsa olanı iptal eder.
// Sıklığa göre: her gün ise tek DAILY tetikleyici (id); belirli günler ise her
// gün için ayrı WEEKLY tetikleyici (id#weekday). İzin yoksa false döner.
export async function scheduleHabitReminder(habit: Habit): Promise<boolean> {
  // Önce tüm eski tetikleyicileri temizle (saat/gün değişmiş ya da kaldırılmış olabilir).
  await cancelHabitReminder(habit.id);

  if (!habit.remind_at) return true; // hatırlatma yok — yapılacak bir şey yok

  // Bitiş tarihi geçmişse hatırlatma kurulmaz (yukarıdaki cancel eskisini de
  // temizledi). Yerel bildirim tetikleyicileri bitiş tarihi bilmediğinden bu
  // kontrol her programlamada (kaydet + her açılıştaki reschedule) yapılır.
  if (habit.end_date && habit.end_date < todayDate()) return true;
  const time = parseHm(habit.remind_at);
  if (!time) return true; // bozuk saat — sessizce atla

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.habitReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
  const content = {
    title: translate(lang, 'notif.reminderTitle'),
    body: habit.title,
    ...soundContent(prefs),
  };
  const sched = habit.schedule;
  const weekdays = sched && sched.freq === 'weekly' ? sched.weekdays ?? [] : [];

  if (sched?.freq === 'interval') {
    // Expo'da "her N günde bir" tekrarlayan tetikleyici yok; sıradaki 8 planlı
    // gün tek seferlik DATE tetikleyicisiyle kurulur (id#i0..i7). Her açılışta
    // rescheduleAllReminders baştan kurduğu için pencere sürekli ileri kayar.
    const cursor = new Date(`${todayDate()}T00:00:00`);
    let scheduledCount = 0;
    for (let i = 0; scheduledCount < 8 && i < 1462; i++) {
      const ymd = toYmd(cursor);
      if (isScheduledOn(sched, ymd) && isWithinHabitDates(habit.start_date, habit.end_date, ymd)) {
        const when = new Date(`${ymd}T00:00:00`);
        when.setHours(time.hour, time.minute, 0, 0);
        if (when.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${habit.id}#i${scheduledCount}`,
            content,
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
          });
          scheduledCount++;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (weekdays.length > 0) {
    // Belirli günler: her seçili gün için ayrı haftalık tetikleyici.
    for (const wd of weekdays) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${habit.id}#${wd}`,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: wd + 1, // expo: 1=Pazar ... 7=Cumartesi (JS getDay 0=Pazar)
          hour: time.hour,
          minute: time.minute,
        },
      });
    }
  } else {
    // Her gün (schedule yok ya da daily).
    await Notifications.scheduleNotificationAsync({
      identifier: habit.id,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
      },
    });
  }
  return true;
}

// Bir alışkanlığın hatırlatmasını iptal eder. Günlük (id), haftalık (id#0..#6)
// ve aralıklı (id#i0..#i7) tetikleyicilerin tümünü kapsar. Zaten yoksa sessizce geçer.
export async function cancelHabitReminder(habitId: string): Promise<void> {
  const ids = [
    habitId,
    ...Array.from({ length: 7 }, (_, wd) => `${habitId}#${wd}`),
    ...Array.from({ length: 8 }, (_, k) => `${habitId}#i${k}`),
  ];
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
    }
  }
}

// ZAMANLAYICI alışkanlığı: hedef süreye ulaşınca haber veren tek seferlik yerel
// bildirim. identifier = `timer:${habitId}` (günlük hatırlatma id'leriyle
// çakışmaz). Süre başlarken kurulur; duraklat/bitir/sıfırla'da iptal edilir.
// İzin yoksa sessizce geçer (zamanlayıcı yine çalışır, sadece bildirim olmaz).
export async function scheduleTimerDone(habit: Habit, secondsFromNow: number): Promise<void> {
  await cancelTimerDone(habit.id);
  if (secondsFromNow <= 0) return;
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.timerDone) return; // kullanıcı bu türü kapatmış
  const granted = await ensurePermission();
  if (!granted) return;
  const lang = await getStoredLang();
  await Notifications.scheduleNotificationAsync({
    identifier: `timer:${habit.id}`,
    content: {
      title: translate(lang, 'notif.timerDoneTitle'),
      body: translate(lang, 'notif.timerDoneBody', { title: habit.title }),
      ...soundContent(prefs),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.ceil(secondsFromNow)),
    },
  });
}

export async function cancelTimerDone(habitId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`timer:${habitId}`);
  } catch {
    // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
  }
}

// Açılışta tüm aktif hatırlatmaları yeniden programlar.
// Cihaz yeniden başlatma / uygulama güncellemesi programlanmış bildirimleri
// temizleyebildiği için tek doğru kaynak (DB) baz alınarak yeniden kurulur.
// İzin akışını açılışta tetiklememek için izin YOKSA sessizce çıkar.
export async function rescheduleAllReminders(habits: Habit[]): Promise<void> {
  const withReminder = habits.filter((h) => h.remind_at);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return; // açılışta izin istemeyiz; kullanıcı saat kurunca istenir

  for (const h of withReminder) {
    await scheduleHabitReminder(h);
  }
}

// GÖREV hatırlatması: yalnızca son tarihte SAAT de seçilmişse anlamlıdır — o
// saatte tek seferlik bildirim kurar (identifier: `task:${id}`, habit/timer
// id'leriyle çakışmaz). Saatsiz, tamamlanmış ya da vadesi geçmiş görevlerde
// mevcut bildirim iptal edilir, yeni kurulmaz.
export async function scheduleTaskReminder(task: Task): Promise<boolean> {
  await cancelTaskReminder(task.id);

  if (task.completed_at) return true;
  if (!task.due_date || task.due_date.length <= 10) return true; // saatsiz görev
  const when = new Date(task.due_date);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return true; // geçmiş

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.taskReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
  await Notifications.scheduleNotificationAsync({
    identifier: `task:${task.id}`,
    content: {
      title: translate(lang, 'notif.taskReminderTitle'),
      body: task.title,
      ...soundContent(prefs),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
  return true;
}

export async function cancelTaskReminder(taskId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`task:${taskId}`);
  } catch {
    // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
  }
}

// HEDEF hatırlatması: goals.remind_at doluysa her gün o saatte "hedefe giriş
// yapmayı unutma" bildirimi (identifier: `goal:${id}` — habit/task/timer
// id'leriyle çakışmaz). Tamamlanan ya da son tarihi geçen hedefte kurulmaz,
// varsa eskisi iptal edilir.
export async function scheduleGoalReminder(goal: Goal): Promise<boolean> {
  await cancelGoalReminder(goal.id);

  if (!goal.remind_at) return true;
  if (goalRepo.isCompleted(goal)) return true; // bitmiş hedefe hatırlatma kurulmaz
  if (goal.deadline && goal.deadline < todayDate()) return true; // süresi geçmiş

  const time = parseHm(goal.remind_at);
  if (!time) return true; // bozuk saat — sessizce atla

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.goalReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
  await Notifications.scheduleNotificationAsync({
    identifier: `goal:${goal.id}`,
    content: {
      title: translate(lang, 'notif.goalReminderTitle'),
      body: translate(lang, 'notif.goalReminderBody', { title: goal.title }),
      ...soundContent(prefs),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: time.hour,
      minute: time.minute,
    },
  });
  return true;
}

export async function cancelGoalReminder(goalId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`goal:${goalId}`);
  } catch {
    // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
  }
}

// Açılışta tüm hedef hatırlatmalarını yeniden kurar (bkz. rescheduleAllReminders).
export async function rescheduleAllGoalReminders(goals: Goal[]): Promise<void> {
  const withReminder = goals.filter((g) => g.remind_at);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  for (const g of withReminder) {
    await scheduleGoalReminder(g);
  }
}

// Açılışta tüm saatli, tamamlanmamış, vadesi geçmemiş görev hatırlatmalarını
// yeniden kurar (bkz. rescheduleAllReminders — aynı gerekçe: cihaz/uygulama
// yeniden başlaması programlanmış bildirimleri temizleyebilir).
export async function rescheduleAllTaskReminders(tasks: Task[]): Promise<void> {
  const withTime = tasks.filter((t) => !t.completed_at && t.due_date && t.due_date.length > 10);
  if (withTime.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  for (const t of withTime) {
    await scheduleTaskReminder(t);
  }
}
