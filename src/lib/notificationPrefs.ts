// Notification preferences (AsyncStorage). Non-React modules read them with
// getNotificationPrefs(); the Profile screen goes through NotificationPrefsProvider.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NotificationPrefs {
  enabled: boolean;          // master switch — no notification is scheduled while off
  habitReminders: boolean;   // habit reminders
  taskReminders: boolean;    // task reminders
  goalReminders: boolean;    // goal "don't forget to log" reminders
  timerDone: boolean;        // timer "time's up" notification
  weeklyReview: boolean;     // Sunday-evening review nudge (opt-in)
  sound: boolean;            // notification SOUND (routes to the sound channel on Android)
  vibration: boolean;        // notification VIBRATION (separate from sound)
  customSoundUri: string | null;  // content:// URI from the device's ringtone picker; null = system default
  customSoundName: string | null; // the sound's display name, if known
}

// The on/off preferences (the custom sound is stored separately).
export type BoolPrefKey = Exclude<keyof NotificationPrefs, 'customSoundUri' | 'customSoundName'>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: true,
  habitReminders: true,
  taskReminders: true,
  goalReminders: true,
  timerDone: true,
  weeklyReview: false,
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
  weeklyReview: 'notif:weeklyReview',
  sound: 'notif:sound',
  vibration: 'notif:vibration',
};

const CUSTOM_SOUND_URI_KEY = 'notif:customSoundUri';
const CUSTOM_SOUND_NAME_KEY = 'notif:customSoundName';

// All preferences in one read (defaults: on, except weeklyReview). An unset
// 'vibration' inherits 'sound', which once controlled both.
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
  if (stored.get(KEYS.vibration) == null) out.vibration = out.sound;
  out.customSoundUri = stored.get(CUSTOM_SOUND_URI_KEY) ?? null;
  out.customSoundName = stored.get(CUSTOM_SOUND_NAME_KEY) ?? null;
  return out;
}

export async function setNotificationPref(key: BoolPrefKey, value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS[key], value ? '1' : '0');
}

// uri null = back to the system sound. The channel is made from the URI at
// schedule time (customNotificationChannel.ts).
export async function setCustomSound(uri: string | null, name: string | null): Promise<void> {
  if (uri == null) {
    await AsyncStorage.multiRemove([CUSTOM_SOUND_URI_KEY, CUSTOM_SOUND_NAME_KEY]);
    return;
  }
  await AsyncStorage.setItem(CUSTOM_SOUND_URI_KEY, uri);
  if (name != null) await AsyncStorage.setItem(CUSTOM_SOUND_NAME_KEY, name);
  else await AsyncStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
}

// iOS has no channels, so sound rides on the notification; Android decides it
// by channel (notifications.ts channelIdFor).
export function soundContent(prefs: NotificationPrefs): { sound: boolean } {
  return { sound: prefs.sound };
}
