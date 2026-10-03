// The only module that talks to the native speech recognizer
// (expo-speech-recognition). Decisions live in voiceLogic.ts; the UI flow in
// ui/useVoiceInput.ts.
//
// Privacy guards kept HERE so no caller can forget them:
// - recordingOptions.persist is never set: no audio file is ever written;
// - nothing in this file (or its callers) logs a transcript — Sentry turns
//   console output into crash-report breadcrumbs.
// Android only for now: iOS isn't shipped, and its permission strings and
// on-device rules haven't been tested.

import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule as Speech, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { localeInstalled, type VoiceSupport } from '@/lib/voiceLogic';

export { useSpeechRecognitionEvent };

// Android 13 (API 33) is the first version with a recognizer that is
// guaranteed to run on the device (createOnDeviceSpeechRecognizer).
const ON_DEVICE_MIN_API = 33;

export async function getVoiceSupport(locale: string): Promise<VoiceSupport> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    if (!Speech.isRecognitionAvailable()) return 'unavailable';
    if (Number(Platform.Version) < ON_DEVICE_MIN_API || !Speech.supportsOnDeviceRecognition()) return 'onlineOnly';
  } catch {
    return 'unavailable';
  }
  try {
    const { installedLocales } = await Speech.getSupportedLocales({});
    return localeInstalled(installedLocales, locale) ? 'onDevice' : 'needsModel';
  } catch {
    return 'onlineOnly';
  }
}

export type MicPermission = 'granted' | 'ask' | 'blocked';

export async function getMicPermission(): Promise<MicPermission> {
  const p = await Speech.getMicrophonePermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

export async function requestMicPermission(): Promise<boolean> {
  return (await Speech.requestMicrophonePermissionsAsync()).granted;
}

// 'started' = the system took over (a download dialog or a background
// download); the pack is usable once it finishes.
export async function downloadOfflinePack(locale: string): Promise<'done' | 'started' | 'canceled' | 'failed'> {
  try {
    const r = await Speech.androidTriggerOfflineModelDownload({ locale });
    if (r.status === 'download_success') return 'done';
    return r.status === 'opened_dialog' ? 'started' : 'canceled';
  } catch {
    return 'failed';
  }
}

export function startListening(locale: string, onDevice: boolean): void {
  Speech.start({
    lang: locale,
    interimResults: true,
    maxAlternatives: 1,
    continuous: false,
    requiresOnDeviceRecognition: onDevice,
  });
}

// Ends listening and still delivers what was heard so far.
export function stopListening(): void {
  Speech.stop();
}

// Ends listening and drops the result (closing the form, app to background).
export function abortListening(): void {
  Speech.abort();
}
