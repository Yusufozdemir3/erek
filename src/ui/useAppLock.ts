// Drives the app lock screen: locked at launch when the lock is on, locked again
// when the app comes back after LOCK_GRACE_MS in the background, and the
// prompt for the phone's screen lock. Rules live in lib/appLockLogic.ts.
//
// While the system prompt is up the app can report background/foreground
// changes of its own; those are ignored (`authing`), otherwise unlocking would
// re-lock itself.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import {
  applyScreenSecurity,
  authenticate,
  isLockEnabled,
  onLockEnabledChange,
  setLockEnabled,
} from '@/lib/appLock';
import { shouldLockOnResume } from '@/lib/appLockLogic';

export interface AppLock {
  // false until the stored flag has been read: the cover is shown meanwhile, so
  // the app's content never flashes before the lock appears.
  ready: boolean;
  locked: boolean;
  busy: boolean;
  unlock: () => Promise<void>;
}

export function useAppLock(): AppLock {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = useRef(false);
  const authing = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    isLockEnabled().then((on) => {
      if (!mounted.current) return;
      enabled.current = on;
      applyScreenSecurity(on);
      setLocked(on); // cold start: ask first
      setReady(true);
    });
    const off = onLockEnabledChange((on) => {
      enabled.current = on;
      applyScreenSecurity(on);
      // Switching it ON inside the app doesn't lock the person who just did it;
      // switching it OFF lifts any lock.
      if (!on) setLocked(false);
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (authing.current) return;
      if (state === 'background') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current !== null) {
        // Only a real return counts: an 'active' without a 'background' before it
        // is not the person coming back.
        if (shouldLockOnResume({ enabled: enabled.current, backgroundedAt: backgroundedAt.current, now: Date.now() })) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => {
      mounted.current = false;
      off();
      sub.remove();
    };
  }, []);

  const unlock = useCallback(async () => {
    if (authing.current) return;
    authing.current = true;
    setBusy(true);
    try {
      const outcome = await authenticate(t('lock.prompt'), t('common.cancel'));
      if (!mounted.current) return;
      if (outcome === 'ok') setLocked(false);
      else if (outcome === 'unavailable') {
        // The phone's screen lock is gone: keeping the app locked would trap the user.
        await setLockEnabled(false);
        setLocked(false);
      }
    } finally {
      authing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [t]);

  // The prompt opens by itself whenever the lock appears (once per lock; after a
  // cancel the screen's button asks again).
  useEffect(() => {
    if (ready && locked) unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked]);

  return { ready, locked, busy, unlock };
}
