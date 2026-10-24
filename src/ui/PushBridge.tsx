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
import { celebrationRoute, isCelebrationData, parseCelebrationData } from '@/lib/celebrations';
import { useI18n } from '@/i18n/I18nProvider';
import { isNudgeData, parseNudgeData } from '@/lib/nudgePayload';
import { syncPushRegistration } from '@/lib/pushRegistration';
import { nudgeRecipientUid } from '@/lib/nudgeRecipient';
import { useAppData } from '@/ui/AppData';
import { refreshInbox } from '@/ui/useInbox';

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

  // A friend's push arriving while the app is open: the bell's dot shows now.
  useEffect(() => {
    if (!uid) return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data;
      if (isCelebrationData(data) || isNudgeData(data)) refreshInbox(true);
    });
    return () => sub.remove();
  }, [uid]);

  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const id = r.notification.request.identifier;
      if (handled.current.has(id)) return;
      const data = r.notification.request.content.data;
      // "Ada finished …" (opens the shared item, where you can congratulate) and
      // "Ada congratulated you" (opens your own item).
      const celebration = parseCelebrationData(data, nudgeRecipientUid());
      if (celebration) {
        handled.current.add(id);
        const route = celebrationRoute(celebration);
        // A finished notice opens the friend's item (from the cached shared
        // lists, so no local check); a congratulation needs my own copy.
        const mine = celebration.type === 'congrats';
        const exists =
          !mine || (celebration.kind === 'habit' ? habitRepo.getById(celebration.itemId) : goalRepo.getById(celebration.itemId));
        if (route && exists) router.push(route as Href);
        return;
      }
      const target = parseNudgeData(data, nudgeRecipientUid());
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
