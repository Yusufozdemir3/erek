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
  generalReminders: boolean; // "check off today" nudge at chosen times (generalReminders.ts)
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
  generalReminders: true,
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
  generalReminders: 'notif:generalReminders',
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

// The times of day ("HH:MM", sorted) the general reminder fires at. Kept apart
// from NotificationPrefs, which holds only on/off switches.
const GENERAL_TIMES_KEY = 'notif:generalTimes';
export const DEFAULT_GENERAL_TIMES = ['20:00'];
export const MAX_GENERAL_TIMES = 5;

export async function getGeneralTimes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GENERAL_TIMES_KEY);
    if (raw == null) return DEFAULT_GENERAL_TIMES;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_GENERAL_TIMES;
    return parsed.filter((x): x is string => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x)).sort();
  } catch {
    return DEFAULT_GENERAL_TIMES;
  }
}

export async function setGeneralTimes(times: string[]): Promise<void> {
  await AsyncStorage.setItem(GENERAL_TIMES_KEY, JSON.stringify([...new Set(times)].sort().slice(0, MAX_GENERAL_TIMES)));
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
