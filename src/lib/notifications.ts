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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { goalRepo, reminderRepo } from '@/db';
import type { Goal, Habit, Reminder, Task } from '@/db';
import { isScheduledOn, isWithinHabitDates, todayDate, toYmd } from '@/lib/helpers';
import { getStoredLang } from '@/i18n/I18nProvider';
import { translate } from '@/i18n/translations';
import { getNotificationPrefs, soundContent, type NotificationPrefs } from '@/lib/notificationPrefs';
import { ensureCustomSoundChannel } from '@/lib/customNotificationChannel';
import type { Lang } from '@/i18n/translations';

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

// KANAL MİMARİSİ (Android): API 26+'ta ses ve titreşim bildirimin değil KANALIN
// özelliğidir ve kanal bir kez oluşturulduktan sonra kod ile değiştirilemez
// (yalnız kullanıcı sistem ayarından). Bu yüzden ses×titreşim'in dört
// kombinasyonu için dört ayrı kanal tutuyoruz; her bildirim tercihe göre
// channelIdFor ile doğru kanala yönlendirilir. Tercih değişince yeni kurulan
// bildirimler yeni kanala gider (mevcut zamanlanmışlar reschedule ile taşınır).
// (Silinip aynı id ile yeniden oluşturmak Android'de kullanıcının eski ayarını
// GERİ getirir — bu yüzden dört kanal kalıcı, seçim schedule anında yapılır.)
const REMINDER_CHANNELS = {
  soundVibration: 'reminders-sv',
  soundOnly: 'reminders-s',
  vibrationOnly: 'reminders-v',
  silent: 'reminders-silent',
} as const;

const VIBRATION_PATTERN = [0, 250, 250, 250];

// Tercihe göre hangi kanala yönlendirileceği (yalnız Android'de anlamlı).
// Özel ses seçiliyse (ve ses açıksa) native modülle (bkz. customNotificationChannel.ts)
// o URI'ye bağlı bir kanal oluşturulur/doğrulanır; native modül yoksa (Expo Go /
// henüz derlenmemiş build) sabit kanallara düşülür.
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

// Android'de bildirimlerin gösterilebilmesi için kanal şarttır. Açılışta dört
// kombinasyon kanalı da kurulur (idempotent). Eski tekil 'habit-reminders'
// kanalı temizlenir (artık kullanılmıyor; sistem ayarında kalıntı görünmesin).
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

// Tüm zamanlanmış bildirimleri tarayıp identifier'ı verilen önekle başlayanları
// iptal eder. ÇOKLU hatırlatmada her hatırlatmanın kendi id'si (ve haftalık/
// aralıklı sıklıkta ek son ekler) olduğundan, "hangi id'ler kurulu olabilir"
// listesini önceden bilmek imkansız — Expo'nun kendi kayıtlarını sorup önekle
// eşleşenleri silmek tek güvenilir yol (subtask/milestone silmede id üretmenin
// simetriği: burada da "ne varsa temizle, yeniden kur" deseni).
async function cancelByPrefix(prefix: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (!n.identifier.startsWith(prefix)) continue;
    try {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    } catch {
      // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
    }
  }
}

// Bir alışkanlık için TÜM hatırlatmalarını kurar (0 ya da daha fazla saat).
// Sıklığa göre: her gün ise her hatırlatma için tek DAILY tetikleyici; belirli
// günler ise her hatırlatma × her seçili gün için ayrı WEEKLY tetikleyici;
// "her X günde bir" ise her hatırlatma için sıradaki planlı günlere tek seferlik
// DATE tetikleyicileri. İzin yoksa (ve en az bir hatırlatma kurulacaksa) false döner.
export async function scheduleHabitReminders(habit: Habit, reminders: Reminder[]): Promise<boolean> {
  // Önce bu alışkanlığa ait TÜM eski tetikleyicileri temizle (saat/gün/liste
  // değişmiş ya da tamamen kaldırılmış olabilir).
  await cancelHabitReminders(habit.id);

  if (reminders.length === 0) return true;

  // Bitiş tarihi geçmişse hatırlatma kurulmaz (yukarıdaki cancel eskisini de
  // temizledi). Yerel bildirim tetikleyicileri bitiş tarihi bilmediğinden bu
  // kontrol her programlamada (kaydet + her açılıştaki reschedule) yapılır.
  if (habit.end_date && habit.end_date < todayDate()) return true;

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.habitReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
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
    if (!time) continue; // bozuk saat — sessizce atla
    const base = `habit:${habit.id}:${reminder.id}`;

    if (sched?.freq === 'interval') {
      // Expo'da "her N günde bir" tekrarlayan tetikleyici yok; sıradaki 8 planlı
      // gün tek seferlik DATE tetikleyicisiyle kurulur (base#i0..i7). Her açılışta
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
      // Belirli günler: her seçili gün için ayrı haftalık tetikleyici.
      for (const wd of weekdays) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${base}#${wd}`,
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: wd + 1, // expo: 1=Pazar ... 7=Cumartesi (JS getDay 0=Pazar)
            hour: time.hour,
            minute: time.minute,
            channelId,
          },
        });
      }
    } else {
      // Her gün (schedule yok ya da daily).
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

// Bir alışkanlığın TÜM hatırlatmalarını iptal eder (kaç tane olursa olsun,
// hangi sıklık son ekiyle kurulmuş olursa olsun — bkz. cancelByPrefix).
export async function cancelHabitReminders(habitId: string): Promise<void> {
  await cancelByPrefix(`habit:${habitId}:`);
}

// ZAMANLAYICI (alışkanlık kind='timer' ya da süre-ölçümlü hedef): hedef süreye
// ulaşınca haber veren tek seferlik yerel bildirim. identifier = `timer:${id}`
// (habit/goal id'leri UUID olduğundan aynı ad alanını paylaşmaları çakışma
// yaratmaz; günlük hatırlatma id'leriyle de çakışmaz). Süre başlarken kurulur;
// duraklat/bitir/sıfırla'da iptal edilir. İzin yoksa sessizce geçer (zamanlayıcı
// yine çalışır, sadece bildirim olmaz).
export async function scheduleTimerDone(id: string, title: string, secondsFromNow: number): Promise<void> {
  await cancelTimerDone(id);
  if (secondsFromNow <= 0) return;
  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.timerDone) return; // kullanıcı bu türü kapatmış
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
    // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
  }
}

// Açılışta tüm aktif hatırlatmaları yeniden programlar.
// Cihaz yeniden başlatma / uygulama güncellemesi programlanmış bildirimleri
// temizleyebildiği için tek doğru kaynak (DB) baz alınarak yeniden kurulur.
// İzin akışını açılışta tetiklememek için izin YOKSA sessizce çıkar.
export async function rescheduleAllReminders(habits: Habit[]): Promise<void> {
  const map = reminderRepo.mapByType('habit');
  const withReminder = habits.filter((h) => (map.get(h.id)?.length ?? 0) > 0);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return; // açılışta izin istemeyiz; kullanıcı saat kurunca istenir

  for (const h of withReminder) {
    await scheduleHabitReminders(h, map.get(h.id) ?? []);
  }
}

// GÖREV hatırlatması: TÜM hatırlatma saatleri, son tarihin GÜNÜNDE o saatte
// tek seferlik bildirim kurar (identifier: `task:${id}:${reminderId}`, habit/
// timer id'leriyle çakışmaz). Saat son tarihin kendi saatinden BAĞIMSIZDIR.
// Hatırlatmasız, son tarihsiz, tamamlanmış ya da hatırlatma anı geçmiş görevlerde
// mevcut bildirimler iptal edilir, yeni kurulmaz.
export async function scheduleTaskReminders(task: Task, reminders: Reminder[]): Promise<boolean> {
  await cancelTaskReminders(task.id);

  if (task.completed_at) return true;
  if (reminders.length === 0 || !task.due_date) return true; // hatırlatma ya da son tarih yok

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.taskReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue; // bozuk saat — sessizce atla
    const when = new Date(`${task.due_date.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(when.getTime())) continue;
    when.setHours(time.hour, time.minute, 0, 0);
    if (when.getTime() <= Date.now()) continue; // hatırlatma anı geçmiş

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

export async function cancelTaskReminders(taskId: string): Promise<void> {
  await cancelByPrefix(`task:${taskId}:`);
}

// HEDEF hatırlatması: TÜM hatırlatma saatleri her gün "hedefe giriş yapmayı
// unutma" bildirimi kurar (identifier: `goal:${id}:${reminderId}` — habit/task/
// timer id'leriyle çakışmaz). Tamamlanan ya da son tarihi geçen hedefte
// kurulmaz, varsa eskiler iptal edilir.
export async function scheduleGoalReminders(goal: Goal, reminders: Reminder[]): Promise<boolean> {
  await cancelGoalReminders(goal.id);

  if (reminders.length === 0) return true;
  if (goalRepo.isCompleted(goal)) return true; // bitmiş hedefe hatırlatma kurulmaz
  if (goal.deadline && goal.deadline < todayDate()) return true; // süresi geçmiş

  const prefs = await getNotificationPrefs();
  if (!prefs.enabled || !prefs.goalReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = await getStoredLang();
  const channelId = channelIdFor(prefs, lang);
  for (const reminder of reminders) {
    const time = parseHm(reminder.time);
    if (!time) continue; // bozuk saat — sessizce atla
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

export async function cancelGoalReminders(goalId: string): Promise<void> {
  await cancelByPrefix(`goal:${goalId}:`);
}

// Açılışta tüm hedef hatırlatmalarını yeniden kurar (bkz. rescheduleAllReminders).
export async function rescheduleAllGoalReminders(goals: Goal[]): Promise<void> {
  const map = reminderRepo.mapByType('goal');
  const withReminder = goals.filter((g) => (map.get(g.id)?.length ?? 0) > 0);
  if (withReminder.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  for (const g of withReminder) {
    await scheduleGoalReminders(g, map.get(g.id) ?? []);
  }
}

// Açılışta tüm saatli, tamamlanmamış, vadesi geçmemiş görev hatırlatmalarını
// yeniden kurar (bkz. rescheduleAllReminders — aynı gerekçe: cihaz/uygulama
// yeniden başlaması programlanmış bildirimleri temizleyebilir).
export async function rescheduleAllTaskReminders(tasks: Task[]): Promise<void> {
  const map = reminderRepo.mapByType('task');
  const withTime = tasks.filter((t) => !t.completed_at && t.due_date && (map.get(t.id)?.length ?? 0) > 0);
  if (withTime.length === 0) return;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  for (const t of withTime) {
    await scheduleTaskReminders(t, map.get(t.id) ?? []);
  }
}

// TEK SEFERLİK GEÇİŞ: eski tekil remind_at şeması (identifier = bare habitId /
// `task:${id}` / `goal:${id}`, olası #weekday / #i{n} son ekleriyle) yeni çoklu
// hatırlatma önekiyle (`habit:${id}:${reminderId}` vb.) UYUŞMUYOR — yeni
// cancelByPrefix eskileri asla bulamaz, sessizce kalıcı yetim kalırlardı (eski
// içerikle sonsuza dek çalmaya devam ederler). Bu yüzden bir kerelik: tüm
// zamanlanmış bildirimler nuke edilir; hemen ardından çağrılan rescheduleAll*
// güncel DB durumundan yeni şemayla baştan kurar (veri kaybı yok, yalnız OS'un
// bildirim kuyruğu temizlenir).
const MIGRATED_KEY = 'notif:migratedMultiReminder';
export async function migrateToMultiReminderIfNeeded(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATED_KEY);
  if (done) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // hiç izin/kayıt yoksa hata verebilir — önemsiz, devam.
  }
  await AsyncStorage.setItem(MIGRATED_KEY, '1');
}
