// Native bridge: expo-notifications' channel API only accepts the NAME of a
// sound file bundled with the app in the `sound` field (looked up by basename
// in res/raw; falls back SILENTLY to the default sound if not found). A
// content:// URI from the device's ringtone picker can NEVER be applied this
// way. modules/custom-notification-channel works around this limitation by
// calling NotificationChannel.setSound with the raw Uri.
//
// NEW NATIVE MODULE — NOT present in Expo Go or in a not-yet-compiled build.
// Lazy require + try/catch (same safety pattern as
// src/widget/widgetTaskHandler in the widget code): stays silently inactive
// if not found, and the caller falls back to the fixed channels.

import { Platform } from 'react-native';

interface NativeApi {
  createChannel(channelId: string, name: string, soundUri: string | null, vibrate: boolean): void;
  deleteChannel(channelId: string): void;
  getSoundTitle(soundUri: string): string | null;
}

function loadNative(): NativeApi | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../modules/custom-notification-channel/src/CustomNotificationChannelModule').default as NativeApi;
  } catch {
    return null;
  }
}

// A simple hash (djb2 variant) — produces a deterministic, short channel id
// from the custom sound URI. A separate version counter is NOT NEEDED: when
// the URI changes the hash changes too, so Android's "a channel's sound can't
// be changed from code once created" restriction naturally routes to a new
// channel (the old one just stays around in the system).
function hashUri(uri: string): string {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = (h * 33) ^ uri.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function customChannelId(uri: string, vibrate: boolean): string {
  return `reminders-custom-${hashUri(uri)}-${vibrate ? 'v' : 'nv'}`;
}

// Creates the channel (if needed)/idempotently verifies it and returns its
// id. Returns null if the native module isn't available (Expo Go /
// not-yet-compiled build) — the caller should fall back to the fixed default
// channels in that case.
export function ensureCustomSoundChannel(uri: string, vibrate: boolean, name: string): string | null {
  const native = loadNative();
  if (!native) return null;
  const id = customChannelId(uri, vibrate);
  try {
    native.createChannel(id, name, uri, vibrate);
    return id;
  } catch {
    return null;
  }
}

// The display name of the selected sound (via RingtoneManager) — null if unavailable.
export function getCustomSoundTitle(uri: string): string | null {
  const native = loadNative();
  if (!native) return null;
  try {
    return native.getSoundTitle(uri);
  } catch {
    return null;
  }
}
