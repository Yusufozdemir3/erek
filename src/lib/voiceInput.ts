// Sesli giriş — Android'in kendi sistem konuşma tanıma ekranını açar
// (RecognizerIntent.ACTION_RECOGNIZE_SPEECH; Google uygulaması sağlar, ekstra
// native modül GEREKMEZ — ringtonePicker.ts'teki aynı expo-intent-launcher
// numarası). Maliyet $0 (bizim API çağrımız yok, tanıma tamamen sistemde olur).
//
// CİHAZDA TANIMA UYGULAMASI OLMAYABİLİR (Google Play Services'siz cihazlar,
// bazı özel ROM'lar) — bu durumda intent hiç açılmadan ActivityNotFoundException
// fırlatır. 'unavailable' durumu bunun İÇİN AYRI tutulur ('canceled'dan farklı):
// kullanıcı geri tuşuna basıp vazgeçmesi SESSİZ kalmalı, ama cihazda özellik
// hiç yoksa çağıran bunu açıkça söylemeli (aksi halde mikrofon "çalışmıyor
// gibi" görünür, sebepsiz).

import { Platform } from 'react-native';
import type { Lang } from '@/i18n/translations';

const RECOGNIZE_SPEECH_ACTION = 'android.speech.action.RECOGNIZE_SPEECH';
const EXTRA_LANGUAGE_MODEL = 'android.speech.extra.LANGUAGE_MODEL';
const EXTRA_LANGUAGE = 'android.speech.extra.LANGUAGE';
const EXTRA_PROMPT = 'android.speech.extra.PROMPT';
const EXTRA_MAX_RESULTS = 'android.speech.extra.MAX_RESULTS';
const EXTRA_RESULTS = 'android.speech.extra.RESULTS';
const LANGUAGE_MODEL_FREE_FORM = 'free_form';

// Google'ın recognizer'ı varsayılan olarak kısa bir sessizlikte (~1-1.5sn) hemen
// kapanıyor — bu extralar o eşiği uzatır (tüm cihazlarda garanti değil ama stock
// Android + Google uygulamasında çalışıyor). MINIMUM_LENGTH, kullanıcı konuşmaya
// başlar başlamaz bitmemesi için alt sınır koyar.
const EXTRA_COMPLETE_SILENCE_MS = 'android.speech.extras.SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS';
const EXTRA_POSSIBLY_COMPLETE_SILENCE_MS = 'android.speech.extras.SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS';
const EXTRA_MINIMUM_LENGTH_MS = 'android.speech.extras.SPEECH_INPUT_MINIMUM_LENGTH_MILLIS';

// Uygulama dili -> konuşma tanıma yerel kodu.
const LOCALE_BY_LANG: Record<Lang, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
};

export interface VoiceInputResult {
  status: 'success' | 'canceled' | 'unavailable';
  text: string | null;
}

export async function recognizeSpeech(lang: Lang, promptText: string): Promise<VoiceInputResult> {
  if (Platform.OS !== 'android') return { status: 'unavailable', text: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const IntentLauncher = require('expo-intent-launcher');
    const result = await IntentLauncher.startActivityAsync(RECOGNIZE_SPEECH_ACTION, {
      extra: {
        [EXTRA_LANGUAGE_MODEL]: LANGUAGE_MODEL_FREE_FORM,
        [EXTRA_LANGUAGE]: LOCALE_BY_LANG[lang],
        [EXTRA_PROMPT]: promptText,
        [EXTRA_MAX_RESULTS]: 1,
        [EXTRA_COMPLETE_SILENCE_MS]: 3000,
        [EXTRA_POSSIBLY_COMPLETE_SILENCE_MS]: 3000,
        [EXTRA_MINIMUM_LENGTH_MS]: 15000,
      },
    });
    if (result.resultCode !== IntentLauncher.ResultCode.Success) return { status: 'canceled', text: null };
    const extra = (result.extra ?? {}) as Record<string, unknown>;
    const results = extra[EXTRA_RESULTS];
    const first = Array.isArray(results) ? results[0] : null;
    return { status: 'success', text: typeof first === 'string' ? first : null };
  } catch (e) {
    // Intent hiçbir aktiviteye çözülemedi (ActivityNotFoundException) — cihazda
    // konuşma tanıma sağlayan bir uygulama yok. Kullanıcının vazgeçmesinden
    // (resultCode!=Success, yukarıda) AYRI: burası "özellik cihazda hiç yok" demek.
    console.warn('[Ses] Konuşma tanıma açılamadı (cihazda tanıma uygulaması olmayabilir):', e);
    return { status: 'unavailable', text: null };
  }
}
