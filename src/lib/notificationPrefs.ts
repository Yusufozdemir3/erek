// Bildirim tercihleri — AsyncStorage'da kalıcı. getStoredLang (I18nProvider) ile
// aynı desen: React dışı modüller (notifications.ts, her bildirim kurarken)
// doğrudan okuyabilsin diye burada bir async getter tutulur; Profil ekranı ise
// NotificationPrefsProvider ile reaktif erişir.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  enabled: boolean;          // ana anahtar — kapalıyken hiçbir bildirim kurulmaz
  habitReminders: boolean;   // alışkanlık hatırlatmaları
  taskReminders: boolean;    // görev hatırlatmaları
  timerDone: boolean;        // zamanlayıcı "süre doldu" bildirimi
  sound: boolean;            // bildirim sesi + titreşimi (ikisi birlikte, bkz. notifications.ts soundContent)
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  habitReminders: true,
  taskReminders: true,
  timerDone: true,
  sound: true,
};

const KEYS: Record<keyof NotificationPrefs, string> = {
  enabled: 'notif:enabled',
  habitReminders: 'notif:habitReminders',
  taskReminders: 'notif:taskReminders',
  timerDone: 'notif:timerDone',
  sound: 'notif:sound',
};

// React dışı modüller için: kayıtlı tüm tercihleri okur (yoksa varsayılan: hepsi açık).
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(KEYS) as (keyof NotificationPrefs)[]) {
    const v = await AsyncStorage.getItem(KEYS[key]);
    if (v !== null) out[key] = v === '1';
  }
  return out;
}

export async function setNotificationPref(key: keyof NotificationPrefs, value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS[key], value ? '1' : '0');
}

// Bir bildirim içeriğine tercihe göre ses+titreşim alanlarını ekler. Android'de
// `vibrate` alanı bildirim BAŞINA geçerlidir (kanal ayarı gibi kalıcı/kilitli
// değildir) — bu yüzden tercih değişince yeni kurulan her bildirime hemen yansır.
export function soundContent(prefs: NotificationPrefs): { sound: boolean; vibrate?: number[] } {
  return prefs.sound ? { sound: true } : { sound: false, vibrate: [0] };
}
