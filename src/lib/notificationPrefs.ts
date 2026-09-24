// Notification preferences — persisted in AsyncStorage. Same pattern as
// getStoredLang (I18nProvider): an async getter is kept here so non-React
// modules (notifications.ts, whenever scheduling a notification) can read it
// directly, while the Profile screen accesses it reactively via
// NotificationPrefsProvider.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  enabled: boolean;          // master switch — no notification is scheduled while off
  habitReminders: boolean;   // habit reminders
  taskReminders: boolean;    // task reminders
  goalReminders: boolean;    // goal "don't forget to log" reminders
  timerDone: boolean;        // timer "time's up" notification
  sound: boolean;            // notification SOUND (routes to the sound channel on Android)
  vibration: boolean;        // notification VIBRATION (SEPARATE from sound; see notifications channel architecture)
  customSoundUri: string | null;  // content:// URI from the device's ringtone picker; null = system default
  customSoundName: string | null; // display name of the chosen sound (from RingtoneManager; null if unavailable)
}

// Boolean preferences only — customSoundUri/customSoundName are kept under
// separate (string) keys and are NOT mixed into the '1'/'0' loop below.
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

// For non-React modules: reads all stored preferences (defaults to all-on if
// unset). BACKWARD COMPATIBILITY: 'vibration' didn't used to exist — 'sound'
// used to control both sound and vibration together. If 'notif:vibration' was
// never written, it inherits the old 'notif:sound' value: so a user who had
// turned the combined switch OFF also gets vibration off (they didn't want
// either), while a user who left it on gets both on.
// SINGLE multiGet: this used to be an `await getItem` inside a loop, i.e. 9
// SEQUENTIAL storage round-trips per call. Since this function is called on
// every notification scheduling (per entity), the startup batch reschedule
// was piling up hundreds of unnecessary reads.
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const boolKeys = Object.keys(KEYS) as BoolPrefKey[];
  const pairs = await AsyncStorage.multiGet([
    ...boolKeys.map((k) => KEYS[k]),
    CUSTOM_SOUND_URI_KEY,
    CUSTOM_SOUND_NAME_KEY,
  ]);
  const stored = new Map<string, string | null>(pairs);

  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of boolKeys) {
    const v = stored.get(KEYS[key]);
    if (v != null) out[key] = v === '1';
  }
  // inherit the old combined behavior (see function header)
  if (stored.get(KEYS.vibration) == null) out.vibration = out.sound;
  out.customSoundUri = stored.get(CUSTOM_SOUND_URI_KEY) ?? null;
  out.customSoundName = stored.get(CUSTOM_SOUND_NAME_KEY) ?? null;
  return out;
}

export async function setNotificationPref(key: BoolPrefKey, value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS[key], value ? '1' : '0');
}

// Persists the custom notification sound. uri=null -> revert to system default
// (both are cleared). The channel itself is created in notifications.ts with a
// deterministic id derived from the URI (see customNotificationChannel.ts).
export async function setCustomSound(uri: string | null, name: string | null): Promise<void> {
  if (uri == null) {
    await AsyncStorage.multiRemove([CUSTOM_SOUND_URI_KEY, CUSTOM_SOUND_NAME_KEY]);
    return;
  }
  await AsyncStorage.setItem(CUSTOM_SOUND_URI_KEY, uri);
  if (name != null) await AsyncStorage.setItem(CUSTOM_SOUND_NAME_KEY, name);
  else await AsyncStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
}

// Adds the sound field to iOS notification content (iOS has no channels; sound
// is per-notification). On ANDROID, sound+vibration (including custom sound)
// is determined via the CHANNEL (see notifications.ts channelIdFor) — so we
// only carry sound here; there's NO custom sound selection on iOS
// (pickNotificationSound immediately returns canceled outside Android).
export function soundContent(prefs: NotificationPrefs): { sound: boolean } {
  return { sound: prefs.sound };
}
