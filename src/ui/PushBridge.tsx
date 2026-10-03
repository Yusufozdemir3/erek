// Friend nudges, app side: keeps this device's push registration in step with
// the session (start, sign-in/out, every foreground) and opens the right
// screen when a nudge is tapped. Renders nothing.
//
// A tapped nudge only navigates if its payload is well-formed, addressed to
// the account signed in HERE, and the item exists in the local database —
// push payloads are untrusted input (see lib/nudgePayload.ts).

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { goalRepo, habitRepo } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { parseNudgeData } from '@/lib/nudgePayload';
import { syncPushRegistration } from '@/lib/pushRegistration';
import { nudgeRecipientUid } from '@/lib/nudgeRecipient';
import { useAppData } from '@/ui/AppData';

export function PushBridge() {
  const { authUser } = useAppData();
  const { lang } = useI18n();
  const uid = authUser && !authUser.isAnonymous ? authUser.id : null;
  const handled = useRef(new Set<string>());

  useEffect(() => {
    syncPushRegistration(uid, lang);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncPushRegistration(uid, lang);
    });
    return () => sub.remove();
  }, [uid, lang]);

  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const id = r.notification.request.identifier;
      if (handled.current.has(id)) return;
      const target = parseNudgeData(r.notification.request.content.data, nudgeRecipientUid());
      if (!target) return;
      handled.current.add(id);
      const exists = target.kind === 'habit' ? habitRepo.getById(target.itemId) : goalRepo.getById(target.itemId);
      if (!exists) return;
      router.push(`/${target.kind}/${target.itemId}` as Href);
    };
    // A tap that launched the app: the session is known only once uid is set,
    // which is why this effect re-runs on uid.
    if (uid) Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [uid]);

  return null;
}
