// Once per app start: a signed-in account with no username yet is taken to the
// username screen (friends would otherwise see "unknown user" — the Google name
// is no longer shown). Skipping is fine; it asks again next launch. Renders nothing.

import { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';
import { getMyUsername } from '@/sync';
import { useAppData } from '@/ui/AppData';

export function UsernamePrompt() {
  const { authUser } = useAppData();
  const uid = authUser && !authUser.isAnonymous ? authUser.id : null;
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || asked.current === uid) return;
    let cancelled = false;
    getMyUsername(uid)
      .then((name) => {
        if (cancelled || name !== null) return; // has one, or offline: try next launch
        asked.current = uid;
        router.push('/username?first=1' as Href);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return null;
}
