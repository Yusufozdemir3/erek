// Yerel bildirim katmanı — expo-notifications sarmalayıcısı.
// Alışkanlıkların remind_at saatine göre GÜNLÜK tekrarlayan yerel bildirim kurar.
//
// Tasarım kararı: her bildirimin identifier'ı alışkanlığın id'sidir. Böylece
// programlama/iptal deterministiktir ve ayrı bir notification_id saklamaya
// (şema değişikliği) gerek kalmaz. Aynı id ile yeniden programlamak öncekini değiştirir.
//
// Mimari: bu modül bir yan etki katmanıdır; UI bunu repository çağrılarından
// ayrı olarak çağırır. Veri için tek doğru kaynak yine SQLite (habitRepo).
//
// ⚠ BİLİNEN SINIR — iOS TETİKLEYİCİ BÜTÇESİ (henüz çözülmedi):
// Bir hatırlatma TEK bir tetikleyici değildir: haftalık sıklıkta seçili gün
// sayısı kadar (5 gün = 5 tetikleyici), "her X günde bir"de 8 tane kurulur.
// iOS'ta bekleyen yerel bildirim tavanı 64'tür ve aşıldığında fazlası SESSİZCE
// düşer — kullanıcı hatırlatmasının neden çalmadığını anlayamaz. Android'de
// böyle sert bir tavan yok.
// Şu anki azaltma: varlık başına hatırlatma sayısı sınırlı (bkz.
// ui/formLimits.MAX_REMINDERS_PER_ENTITY), yani en kötü durum belirgin biçimde
// küçüldü. TAM çözüm, tüm varlıkların tetikleyicilerini sayıp bütçeyi en yakın
// zamanlılara ayıran GLOBAL bir programlayıcıdır; iOS henüz yayınlanmadığı ve
// bütçenin gerçek cihazda ölçülmesi gerektiği için bilerek ertelendi.
// iOS yayına alınmadan ÖNCE bu not ele alınmalı.

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

// TOPLU YENİDEN PROGRAMLAMA BAĞLAMI — yalnız rescheduleAll* geçişlerinde kullanılır.
//
// Sorun: her scheduleX çağrısı önce cancelX yapar, o da "kurulu bildirimlerin
// TAMAMINI" native köprüden çeker. Açılışta bu, hatırlatması olan HER alışkanlık,
// HER görev ve HER hedef için ayrı ayrı tekrarlanıyordu — 80 varlıklı bir
// kullanıcıda 80 tam liste taraması + 80 tercih okuması + 80 dil okuması, hepsi
// seri. Bağlam bir kez kurulup aşağı geçirilince tur başına BİRE iner.
//
// Anlık görüntünün "bayatlaması" sorun DEĞİL: her önek tek bir varlığa aittir ve
// her varlık turda bir kez işlenir, yani bir varlığın iptali yalnızca ÖNCEDEN
// var olan tetikleyicilerini arar — tur sırasında kurduklarımızı değil.
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

// Tüm zamanlanmış bildirimleri tarayıp identifier'ı verilen önekle başlayanları
// iptal eder. ÇOKLU hatırlatmada her hatırlatmanın kendi id'si (ve haftalık/
// aralıklı sıklıkta ek son ekler) olduğundan, "hangi id'ler kurulu olabilir"
// listesini önceden bilmek imkansız — Expo'nun kendi kayıtlarını sorup önekle
// eşleşenleri silmek tek güvenilir yol (subtask/milestone silmede id üretmenin
// simetriği: burada da "ne varsa temizle, yeniden kur" deseni).
// ctx verilirse liste yeniden çekilmez (bkz. RescheduleCtx).
async function cancelByPrefix(prefix: string, ctx?: RescheduleCtx): Promise<void> {
  const all = ctx?.scheduled ?? (await Notifications.getAllScheduledNotificationsAsync());
  const matching = all.filter((n) => n.identifier.startsWith(prefix));
  await Promise.all(
    matching.map(async (n) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      } catch {
        // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
      }
    })
  );
}

// Bir alışkanlık için TÜM hatırlatmalarını kurar (0 ya da daha fazla saat).
// Sıklığa göre: her gün ise her hatırlatma için tek DAILY tetikleyici; belirli
// günler ise her hatırlatma × her seçili gün için ayrı WEEKLY tetikleyici;
// "her X günde bir" ise her hatırlatma için sıradaki planlı günlere tek seferlik
// DATE tetikleyicileri. İzin yoksa (ve en az bir hatırlatma kurulacaksa) false döner.
export async function scheduleHabitReminders(
  habit: Habit,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  // Önce bu alışkanlığa ait TÜM eski tetikleyicileri temizle (saat/gün/liste
  // değişmiş ya da tamamen kaldırılmış olabilir).
  await cancelHabitReminders(habit.id, ctx);

  if (reminders.length === 0) return true;

  // YAŞAM ARALIĞI KONTROLÜ. Yerel bildirim tetikleyicileri başlangıç/bitiş
  // tarihini bilmez (DAILY/WEEKLY sonsuza dek tekrar eder), o yüzden aralık her
  // programlamada burada denetlenir — kaydetmede ve her toplu yeniden kurulumda.
  const today = todayDate();
  // Bitmiş alışkanlık: kurulmaz (yukarıdaki cancel eskisini de temizledi).
  if (habit.end_date && habit.end_date < today) return true;
  // HENÜZ BAŞLAMAMIŞ alışkanlık: kurulmaz. Eskiden yalnız bitiş tarihi
  // bakılıyordu ve "1 Eylül'de başlasın" diyen kullanıcı BUGÜNDEN itibaren
  // bildirim alıyordu — üstelik alışkanlık listelerde daha görünmüyorken
  // (useTodayData aynı aralığı zaten süzüyor), yani uygulama kendisiyle
  // çelişiyordu. Başlangıç günü geldiğinde toplu yeniden kurulum devreye girer
  // (bkz. rescheduleEverything: açılışta ve gün dönümünde çalışır).
  if (habit.start_date && habit.start_date > today) return true;

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.habitReminders) return true; // kullanıcı bu türü kapatmış

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
export async function cancelHabitReminders(habitId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`habit:${habitId}:`, ctx);
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

  // Tarama + tercih + dil TUR BAŞINA bir kez (bkz. RescheduleCtx).
  const ctx = await buildRescheduleCtx();
  for (const h of withReminder) {
    await scheduleHabitReminders(h, map.get(h.id) ?? [], ctx);
  }
}

// GÖREV hatırlatması: TÜM hatırlatma saatleri, son tarihin GÜNÜNDE o saatte
// tek seferlik bildirim kurar (identifier: `task:${id}:${reminderId}`, habit/
// timer id'leriyle çakışmaz). Saat son tarihin kendi saatinden BAĞIMSIZDIR.
// Hatırlatmasız, son tarihsiz, tamamlanmış ya da hatırlatma anı geçmiş görevlerde
// mevcut bildirimler iptal edilir, yeni kurulmaz.
export async function scheduleTaskReminders(
  task: Task,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelTaskReminders(task.id, ctx);

  if (task.completed_at) return true;
  if (reminders.length === 0 || !task.due_date) return true; // hatırlatma ya da son tarih yok

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.taskReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
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

export async function cancelTaskReminders(taskId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`task:${taskId}:`, ctx);
}

// Bir görevin hatırlatmalarını GÜNCEL DB durumuna göre yeniden kurar ya da iptal
// eder. Neden ayrı bir fonksiyon: tekrarlayan görev "tamamla"da tamamlanmak
// YERİNE bir sonraki tarihe ileri sarabilir (bkz. taskRepo.setCompleted), yani
// "bu görev artık tamamlandı mı" sorusunun cevabı ancak yazma işleminden SONRA
// tekrar okunarak bilinir. Bu karar üç ekranda (Bugün, Görevler, düzenleme
// paneli) birebir aynı beş satır olarak kopyalanmıştı ve dördünde de dönen söz
// yakalanmıyordu — reddedildiğinde "unhandled rejection" oluyordu.
//
// HİÇBİR KOŞULDA REDDETMEZ: bu bir yan etkidir, kullanıcının yaptığı işaretleme
// işlemi bildirim katmanı yüzünden hata veriyormuş gibi görünmemeli. İzin reddi
// de burada sessizdir (her işaretlemede izin uyarısı göstermek rahatsız edici
// olurdu — uyarı yalnızca kullanıcı hatırlatmayı BİLEREK değiştirdiğinde çıkar,
// bkz. TaskForm/AddSheet kaydetme yolları).
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

// HEDEF hatırlatması: TÜM hatırlatma saatleri her gün "hedefe giriş yapmayı
// unutma" bildirimi kurar (identifier: `goal:${id}:${reminderId}` — habit/task/
// timer id'leriyle çakışmaz). Tamamlanan ya da son tarihi geçen hedefte
// kurulmaz, varsa eskiler iptal edilir.
export async function scheduleGoalReminders(
  goal: Goal,
  reminders: Reminder[],
  ctx?: RescheduleCtx
): Promise<boolean> {
  await cancelGoalReminders(goal.id, ctx);

  if (reminders.length === 0) return true;
  if (goalRepo.isCompleted(goal)) return true; // bitmiş hedefe hatırlatma kurulmaz
  if (goal.deadline && goal.deadline < todayDate()) return true; // süresi geçmiş

  const prefs = ctx?.prefs ?? (await getNotificationPrefs());
  if (!prefs.enabled || !prefs.goalReminders) return true; // kullanıcı bu türü kapatmış

  const granted = await ensurePermission();
  if (!granted) return false;

  const lang = ctx?.lang ?? (await getStoredLang());
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

export async function cancelGoalReminders(goalId: string, ctx?: RescheduleCtx): Promise<void> {
  await cancelByPrefix(`goal:${goalId}:`, ctx);
}

// Açılışta tüm hedef hatırlatmalarını yeniden kurar (bkz. rescheduleAllReminders).
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

// Açılışta tüm saatli, tamamlanmamış, vadesi geçmemiş görev hatırlatmalarını
// yeniden kurar (bkz. rescheduleAllReminders — aynı gerekçe: cihaz/uygulama
// yeniden başlaması programlanmış bildirimleri temizleyebilir).
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
  await cancelAllReminders();
  await AsyncStorage.setItem(MIGRATED_KEY, '1');
}

// ÜÇ VARLIK TÜRÜNÜN HATIRLATMALARINI GÜNCEL DB DURUMUNDAN BAŞTAN KURAR.
//
// Neden tek fonksiyon: aynı üçlü çağrı açılışta (AppData), gün dönümünde
// (AppData'nın ön plan tetikleyicisi) ve hesap değişiminden sonra (LoginScreen)
// tekrarlanıyordu; üç kopyanın da kendi hata yakalaması vardı ve biri unutulursa
// sessizce "unhandled rejection" oluyordu.
//
// NEDEN GÜN DÖNÜMÜNDE DE ÇAĞRILMALI: hatırlatmaların geçerliliği TARİHE bağlı
// (alışkanlığın başlangıç/bitiş tarihi, görevin son tarihi, hedefin deadline'ı)
// ama kurulan OS tetikleyicileri tarih bilmez — DAILY/WEEKLY sonsuza dek tekrar
// eder. Eskiden yeniden kurulum YALNIZCA süreç yeniden başladığında çalışıyordu;
// Android süreci günlerce canlı tuttuğu için bitmiş bir alışkanlık ya da süresi
// geçmiş bir hedef haftalarca bildirim atmaya devam edebiliyordu (ve yeni
// başlayan bir alışkanlık da hiç başlamıyordu).
//
// HİÇBİR KOŞULDA REDDETMEZ: bu bir yan etki katmanıdır, çağıranın akışını bozmaz.
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

// Hesap birleştirme/değiştirme sonrası çağrılır (bkz. LoginScreen.onGoogle):
// reassignLocalIds (birleştir) tüm alışkanlık/görev/hedef/hatırlatma satırlarına
// YENİ id verir, clearLocalData (değiştir) hepsini SİLİP yeniden indirir — ikisinde
// de OS'un bildirim kuyruğunda ESKİ id'lerle kurulmuş tetikleyiciler yetim kalır:
// cancelHabitReminders(yeniId) onları asla bulamaz, eski içerikle sonsuza dek
// (çift) çalmaya devam ederler. Yukarıdaki migrateToMultiReminderIfNeeded'daki
// aynı "nuke + rescheduleAll* güncel DB'den baştan kurar" deseni burada da geçerli.
export async function cancelAllReminders(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // hiç izin/kayıt yoksa hata verebilir — önemsiz, devam.
  }
}
