// Opens the device's system ringtone/notification sound picker (Android-only).
// expo-notifications CANNOT use the selected content:// URI DIRECTLY — the
// channel API only accepts a bundled sound file NAME, and silently falls back
// to the default for an arbitrary URI (see the note at the top of
// customNotificationChannel.ts). That's why the URI is handed off to our own
// native channel module.
//
// expo-intent-launcher was just added in this round (same reason as
// modules/custom-notification-channel) — the native side may not be found yet
// in a not-yet-compiled build (including Expo Go); a dynamic import + try/catch
// returns canceled silently in that case.

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
  uri: string | null; // null = user picked "Silent" (also null on cancel, but distinguished by canceled=true)
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
    console.warn('[Bildirim] Ses seçici açılamadı:', e); // native module missing (Expo Go / older build) or some other error
    return { canceled: true, uri: null };
  }
}
