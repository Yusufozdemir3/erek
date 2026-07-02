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
import type { Habit } from '@/db';
import { todayDate } from '@/lib/helpers';

// Uygulama ön plandayken de bildirimin görünmesini sağlar. Bir kez kurulur.
export function setNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Android'de bildirimlerin gösterilebilmesi için bir kanal şarttır. Açılışta kurulur.
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('habit-reminders', {
    name: 'Alışkanlık hatırlatmaları',
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

  const granted = await ensurePermission();
  if (!granted) return false;

  const content = { title: 'Alışkanlık zamanı', body: habit.title };
  const sched = habit.schedule;
  const weekdays = sched && sched.freq === 'weekly' ? sched.weekdays ?? [] : [];

  if (weekdays.length > 0) {
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

// Bir alışkanlığın hatırlatmasını iptal eder. Günlük (id) ve olası tüm haftalık
// (id#0 .. id#6) tetikleyicileri kapsar. Zaten yoksa sessizce geçer.
export async function cancelHabitReminder(habitId: string): Promise<void> {
  const ids = [habitId, ...Array.from({ length: 7 }, (_, wd) => `${habitId}#${wd}`)];
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // programlanmış bildirim yoksa hata fırlatabilir — önemsiz.
    }
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
