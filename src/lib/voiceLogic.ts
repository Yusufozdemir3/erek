// Pure decisions behind voice input (no native module here, so it's testable
// in the Node project). voice.ts talks to the recognizer; this file decides
// WHICH recognizer may be used and how errors read.
//
// Privacy rule (A+ in the voice-task plan): audio stays on the device by
// default. Android only GUARANTEES that from Android 13 (a dedicated
// on-device recognizer); below that, or without the language pack, the only
// option is Google's online recognition — used only after the user agreed to
// it once (stored per device, revocable under Appearance).

import type { Lang } from '@/i18n/translations';

// What the device can do for the current language.
export type VoiceSupport =
  | 'unavailable' // no recognizer at all (e.g. no Google services)
  | 'onDevice' // Android 13+ with the language pack installed
  | 'needsModel' // Android 13+, language pack not downloaded yet
  | 'onlineOnly'; // older Android: no guaranteed on-device recognizer

// What to do when the mic is tapped.
export type VoicePlan =
  | 'unavailable'
  | 'onDevice' // listen, audio stays on the phone
  | 'online' // listen through Google (consent already given)
  | 'offerModel' // ask: download the pack, or use online
  | 'askConsent'; // ask before the first online use

export function planVoice(support: VoiceSupport, onlineConsent: boolean): VoicePlan {
  switch (support) {
    case 'unavailable':
      return 'unavailable';
    case 'onDevice':
      return 'onDevice';
    case 'needsModel':
      // Once online use is accepted, don't nag about the pack on every tap;
      // when it gets installed, support turns into 'onDevice' by itself.
      return onlineConsent ? 'online' : 'offerModel';
    case 'onlineOnly':
      return onlineConsent ? 'online' : 'askConsent';
  }
}

// The recognizer follows the APP language, not the device's.
const SPEECH_LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };

export function speechLocale(lang: Lang): string {
  return SPEECH_LOCALE[lang];
}

// Is a pack for `locale` among the installed ones? Services report "tr-TR",
// "tr_TR" or just "tr"; any variant of the same language counts.
export function localeInstalled(installed: readonly string[], locale: string): boolean {
  const langOf = (l: string) => l.toLowerCase().replace('_', '-').split('-')[0];
  const want = langOf(locale);
  return installed.some((l) => langOf(l) === want);
}

export type VoiceErrorKind =
  | 'silent' // we aborted it ourselves
  | 'noSpeech'
  | 'network'
  | 'permission'
  | 'unavailable'
  | 'language'
  | 'busy'
  | 'generic';

export function voiceErrorKind(code: string): VoiceErrorKind {
  switch (code) {
    case 'aborted':
      return 'silent';
    case 'no-speech':
    case 'speech-timeout':
      return 'noSpeech';
    case 'network':
      return 'network';
    case 'not-allowed':
      return 'permission';
    case 'service-not-allowed':
      return 'unavailable';
    case 'language-not-supported':
      return 'language';
    case 'busy':
      return 'busy';
    default:
      return 'generic';
  }
}

// Hard cap on one listening session: the mic must never stay open by accident.
export const MAX_LISTEN_MS = 30_000;
