// Android: expo-notifications can only use a sound bundled with the app, so a
// ringtone picked on the phone (content:// URI) needs this native module
// (modules/custom-notification-channel), which sets the channel's sound
// directly. Absent in Expo Go / older builds: callers use the fixed channels.

import { Platform } from 'react-native';

interface NativeApi {
  createChannel(channelId: string, name: string, soundUri: string | null, vibrate: boolean): void;
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

// A short channel id from the URI (djb2): a new sound gets a new channel,
// since a channel's sound can't change after creation.
function hashUri(uri: string): string {
  let h = 5381;
  for (let i = 0; i < uri.length; i++) h = (h * 33) ^ uri.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function customChannelId(uri: string, vibrate: boolean): string {
  return `reminders-custom-${hashUri(uri)}-${vibrate ? 'v' : 'nv'}`;
}

// Creates the channel if needed and returns its id; null without the native module.
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

// The sound's display name (RingtoneManager), or null.
export function getCustomSoundTitle(uri: string): string | null {
  const native = loadNative();
  if (!native) return null;
  try {
    return native.getSoundTitle(uri);
  } catch {
    return null;
  }
}
