// Voice input for a form field: the mic flow from tap to final transcript.
//
// Tap -> (support check) -> on-device, or online after a one-time consent,
// or an offer to download the language pack -> microphone permission (with a
// short explanation first) -> listen. Listening ends on silence, on a second
// tap, after MAX_LISTEN_MS at the latest, and immediately (result dropped)
// when the app leaves the foreground or the form unmounts.
//
// The transcript only lives in state here and is handed to onFinal; it is
// never stored or logged (see lib/voice.ts).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import {
  abortListening,
  downloadOfflinePack,
  getMicPermission,
  getVoiceSupport,
  requestMicPermission,
  startListening,
  stopListening,
  useSpeechRecognitionEvent,
} from '@/lib/voice';
import { MAX_LISTEN_MS, planVoice, speechLocale, voiceErrorKind, type VoiceSupport } from '@/lib/voiceLogic';
import { getOnlineConsent, setOnlineConsent } from '@/lib/voicePrefs';

export interface VoiceInput {
  supported: boolean; // show the mic at all
  listening: boolean;
  partial: string; // what's been heard so far (live)
  error: string | null; // last failure, as a sentence for the user
  toggle: () => void; // tap: start, or stop while listening
}

type ModelChoice = 'download' | 'online' | 'cancel';

// enabled=false: no native support check, the mic stays hidden (edit mode).
export function useVoiceInput(onFinal: (text: string) => void, enabled = true): VoiceInput {
  const { t, lang } = useI18n();
  const locale = speechLocale(lang);
  const [support, setSupport] = useState<VoiceSupport | null>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  // This instance owns the current session (recognizer events are global).
  const active = useRef(false);
  const busy = useRef(false); // a start() is walking through its dialogs
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The form can close while a dialog (consent, permission) is open; the mic
  // must never open after that, with no UI left to show it.
  const mounted = useRef(true);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getVoiceSupport(locale).then((s) => alive && setSupport(s));
    return () => {
      alive = false;
    };
  }, [locale, enabled]);

  const finish = useCallback(() => {
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setListening(false);
    setPartial('');
  }, []);

  // Leaving the app or the form ends the session at once, result dropped —
  // without waiting for the recognizer to confirm.
  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && active.current) {
        abortListening();
        finish();
      }
    });
    return () => {
      mounted.current = false;
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
      if (active.current) {
        active.current = false;
        abortListening();
      }
    };
  }, [finish]);

  useSpeechRecognitionEvent('start', () => {
    if (active.current) setListening(true);
  });
  useSpeechRecognitionEvent('result', (e) => {
    if (!active.current) return;
    const text = e.results[0]?.transcript?.trim() ?? '';
    if (!e.isFinal) {
      setPartial(text);
      return;
    }
    finish();
    if (text) onFinalRef.current(text);
    else setError(t('voice.err.noSpeech'));
  });
  useSpeechRecognitionEvent('nomatch', () => {
    if (!active.current) return;
    finish();
    setError(t('voice.err.noSpeech'));
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (!active.current) return;
    finish();
    const kind = voiceErrorKind(e.error);
    if (kind !== 'silent') setError(t(`voice.err.${kind}`));
  });
  useSpeechRecognitionEvent('end', () => {
    if (active.current) finish();
  });

  const confirm = (title: string, body: string, ok: string) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(
        title,
        body,
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: ok, onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      )
    );

  const askModel = () =>
    new Promise<ModelChoice>((resolve) =>
      Alert.alert(
        t('voice.modelTitle'),
        t('voice.modelBody'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve('cancel') },
          { text: t('voice.useOnline'), onPress: () => resolve('online') },
          { text: t('voice.download'), onPress: () => resolve('download') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') }
      )
    );

  const start = async () => {
    setError(null);
    // Re-checked on every tap: a pack may have finished downloading meanwhile.
    const now = await getVoiceSupport(locale);
    setSupport(now);
    let plan = planVoice(now, await getOnlineConsent());
    if (plan === 'unavailable') {
      setError(t('voice.err.unavailable'));
      return;
    }
    if (plan === 'offerModel') {
      const choice = await askModel();
      if (choice === 'cancel') return;
      if (choice === 'download') {
        const r = await downloadOfflinePack(locale);
        if (r === 'started') Alert.alert(t('voice.modelStartedTitle'), t('voice.modelStartedBody'));
        if (r === 'failed') setError(t('voice.err.download'));
        if (r !== 'done') return;
        plan = 'onDevice';
      } else {
        plan = 'askConsent';
      }
    }
    if (plan === 'askConsent') {
      // "This phone can't do it itself" only when that's true — not when the
      // user just picked online over downloading the pack.
      const body = now === 'onlineOnly' ? `${t('voice.onlineWhy')} ${t('voice.onlineBody')}` : t('voice.onlineBody');
      if (!(await confirm(t('voice.onlineTitle'), body, t('voice.onlineAllow')))) return;
      await setOnlineConsent(true);
      plan = 'online';
    }

    const perm = await getMicPermission();
    if (perm === 'blocked') {
      Alert.alert(t('voice.micBlockedTitle'), t('voice.micBlockedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('voice.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      return;
    }
    if (perm === 'ask') {
      if (!(await confirm(t('voice.micTitle'), t('voice.micBody'), t('voice.micContinue')))) return;
      if (!(await requestMicPermission())) return;
    }
    if (!mounted.current) return; // the form closed during a dialog

    active.current = true;
    setPartial('');
    setListening(true); // don't wait for the recognizer's 'start' to show it
    timer.current = setTimeout(() => {
      stopListening();
      // A recognizer that never answers must not leave the mic looking busy.
      timer.current = setTimeout(() => active.current && finish(), 3000);
    }, MAX_LISTEN_MS);
    try {
      startListening(locale, plan === 'onDevice');
    } catch {
      finish();
      setError(t('voice.err.generic'));
    }
  };

  const toggle = () => {
    if (active.current) {
      stopListening();
      return;
    }
    if (busy.current) return;
    busy.current = true;
    start()
      .catch(() => setError(t('voice.err.generic')))
      .finally(() => {
        busy.current = false;
      });
  };

  const supported = enabled && support !== null && support !== 'unavailable';
  return { supported, listening, partial, error, toggle };
}
