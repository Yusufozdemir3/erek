// Bildirim tercihleri — AsyncStorage'da kalıcı. getStoredLang (I18nProvider) ile
// aynı desen: React dışı modüller (notifications.ts, her bildirim kurarken)
// doğrudan okuyabilsin diye burada bir async getter tutulur; Profil ekranı ise
// NotificationPrefsProvider ile reaktif erişir.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  enabled: boolean;          // ana anahtar — kapalıyken hiçbir bildirim kurulmaz
  habitReminders: boolean;   // alışkanlık hatırlatmaları
  taskReminders: boolean;    // görev hatırlatmaları
  goalReminders: boolean;    // hedef "giriş yapmayı unutma" hatırlatmaları
  timerDone: boolean;        // zamanlayıcı "süre doldu" bildirimi
  sound: boolean;            // bildirim SESİ (Android'de ses'li kanala yönlendirir)
  vibration: boolean;        // bildirim TİTREŞİMİ (ses'ten AYRI; bkz. notifications kanal mimarisi)
  customSoundUri: string | null;  // cihazın zil sesi seçicisinden alınan content:// URI; null = sistem varsayılanı
  customSoundName: string | null; // seçilen sesin görünen adı (RingtoneManager'dan; alınamazsa null)
}

// Yalnız boolean tercihler — customSoundUri/customSoundName ayrı anahtarlarda
// (string) tutulur, aşağıdaki '1'/'0' döngüsüne KARIŞTIRILMAZ.
export type BoolPrefKey = Exclude<keyof NotificationPrefs, 'customSoundUri' | 'customSoundName'>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  habitReminders: true,
  taskReminders: true,
  goalReminders: true,
  timerDone: true,
  sound: true,
  vibration: true,
  customSoundUri: null,
  customSoundName: null,
};

const KEYS: Record<BoolPrefKey, string> = {
  enabled: 'notif:enabled',
  habitReminders: 'notif:habitReminders',
  taskReminders: 'notif:taskReminders',
  goalReminders: 'notif:goalReminders',
  timerDone: 'notif:timerDone',
  sound: 'notif:sound',
  vibration: 'notif:vibration',
};

const CUSTOM_SOUND_URI_KEY = 'notif:customSoundUri';
const CUSTOM_SOUND_NAME_KEY = 'notif:customSoundName';

// React dışı modüller için: kayıtlı tüm tercihleri okur (yoksa varsayılan: hepsi açık).
// GERİYE UYUM: 'vibration' eskiden yoktu — 'sound' hem sesi hem titreşimi birlikte
// yönetiyordu. 'notif:vibration' hiç yazılmamışsa eski 'notif:sound' değerini miras
// alır: böylece combined'ı KAPATMIŞ kullanıcıda titreşim de kapalı gelir (ikisini
// birden istemiyordu), açık bırakmışta ikisi de açık.
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(KEYS) as BoolPrefKey[]) {
    const v = await AsyncStorage.getItem(KEYS[key]);
    if (v !== null) out[key] = v === '1';
  }
  const vibRaw = await AsyncStorage.getItem(KEYS.vibration);
  if (vibRaw === null) out.vibration = out.sound; // eski combined davranışını miras al
  out.customSoundUri = await AsyncStorage.getItem(CUSTOM_SOUND_URI_KEY);
  out.customSoundName = await AsyncStorage.getItem(CUSTOM_SOUND_NAME_KEY);
  return out;
}

export async function setNotificationPref(key: BoolPrefKey, value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS[key], value ? '1' : '0');
}

// Özel bildirim sesini kalıcılaştırır. uri=null -> sistem varsayılanına dönüş
// (ikisi de temizlenir). Kanalın kendisi notifications.ts'te URI'den türetilen
// deterministik bir id ile oluşturulur (bkz. customNotificationChannel.ts).
export async function setCustomSound(uri: string | null, name: string | null): Promise<void> {
  if (uri == null) {
    await AsyncStorage.multiRemove([CUSTOM_SOUND_URI_KEY, CUSTOM_SOUND_NAME_KEY]);
    return;
  }
  await AsyncStorage.setItem(CUSTOM_SOUND_URI_KEY, uri);
  if (name != null) await AsyncStorage.setItem(CUSTOM_SOUND_NAME_KEY, name);
  else await AsyncStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
}

// iOS bildirim içeriğine ses alanını ekler (iOS'ta kanal yoktur; ses bildirim
// başınadır). ANDROID'de ses+titreşim (özel ses dahil) KANAL üzerinden belirlenir
// (bkz. notifications.ts channelIdFor) — bu yüzden burada yalnız sesi taşıyoruz;
// iOS'ta özel ses seçimi YOK (pickNotificationSound Android dışında hemen iptal döner).
export function soundContent(prefs: NotificationPrefs): { sound: boolean } {
  return { sound: prefs.sound };
}
