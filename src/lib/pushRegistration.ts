// Getting this device's Expo push token and keeping its registration current
// (friend nudges). Runs on start, on sign-in and on every foreground — see
// ui/PushBridge.tsx. sync/pushTokens.ts does the server side.
//
// No token is registered unless the user can actually SEE notifications
// (permission granted): otherwise friends would get "sent" for nudges that
// never show. The token needs Firebase (google-services.json in the build);
// without it getExpoPushTokenAsync throws and nudges fall back to the share
// sheet — nothing else breaks.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import type { Lang } from '@/i18n/translations';
import { getNotificationPrefs } from '@/lib/notificationPrefs';
import { setNudgeRecipientUid } from '@/lib/nudgeRecipient';
import { registerPushToken, retryPendingRelease, unregisterPushToken } from '@/sync/pushTokens';

// uid: the signed-in, non-anonymous account (null = signed out).
export async function syncPushRegistration(uid: string | null, lang: Lang): Promise<void> {
  await retryPendingRelease().catch(() => {});
  if (!uid) return;
  setNudgeRecipientUid(uid);
  if (Platform.OS !== 'android') return; // iOS isn't shipped; its push setup is untested
  try {
    // "Notifications off" (system permission or the app's own master switch)
    // also means no nudges — a friend would otherwise get "sent" for nothing.
    const [perm, prefs] = await Promise.all([Notifications.getPermissionsAsync(), getNotificationPrefs()]);
    if (!perm.granted || !prefs.enabled) {
      await unregisterPushToken();
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, uid, lang);
  } catch {
    // No Firebase config in this build, or offline: retried next foreground.
  }
}
