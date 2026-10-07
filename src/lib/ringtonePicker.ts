// Android's system notification-sound picker (expo-intent-launcher). The
// picked content:// URI goes to our own channel module, since
// expo-notifications can't use it (customNotificationChannel.ts). Without the
// native side (Expo Go, an older build) it reports canceled.

import { Platform } from 'react-native';

const RINGTONE_PICKER_ACTION = 'android.intent.action.RINGTONE_PICKER';
const EXTRA_TYPE = 'android.intent.extra.ringtone.TYPE';
const EXTRA_SHOW_DEFAULT = 'android.intent.extra.ringtone.SHOW_DEFAULT';
const EXTRA_SHOW_SILENT = 'android.intent.extra.ringtone.SHOW_SILENT';
const EXTRA_EXISTING_URI = 'android.intent.extra.ringtone.EXISTING_URI';
const EXTRA_PICKED_URI = 'android.intent.extra.ringtone.PICKED_URI';
const TYPE_NOTIFICATION = 2; // android.media.RingtoneManager.TYPE_NOTIFICATION

export interface RingtonePickResult {
  canceled: boolean;
  uri: string | null; // null = "Silent" (or canceled, see canceled)
}

export async function pickNotificationSound(existingUri?: string | null): Promise<RingtonePickResult> {
  if (Platform.OS !== 'android') return { canceled: true, uri: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IntentLauncher = require('expo-intent-launcher');
    const result = await IntentLauncher.startActivityAsync(RINGTONE_PICKER_ACTION, {
      extra: {
        [EXTRA_TYPE]: TYPE_NOTIFICATION,
        [EXTRA_SHOW_DEFAULT]: true,
        [EXTRA_SHOW_SILENT]: true,
        ...(existingUri ? { [EXTRA_EXISTING_URI]: existingUri } : {}),
      },
    });
    if (result.resultCode !== IntentLauncher.ResultCode.Success) return { canceled: true, uri: null };
    const extra = (result.extra ?? {}) as Record<string, unknown>;
    const picked = extra[EXTRA_PICKED_URI];
    return { canceled: false, uri: typeof picked === 'string' ? picked : null };
  } catch (e) {
    console.warn('[Bildirim] Ses seçici açılamadı:', e);
    return { canceled: true, uri: null };
  }
}
