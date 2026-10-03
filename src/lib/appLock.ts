// App lock: the OS side. Authentication is the PHONE's own screen lock
// (fingerprint/face with PIN/pattern fallback) through expo-local-authentication;
// Erek stores no credential, only an on/off flag on this phone.
//
// While the lock is on, FLAG_SECURE is set (expo-screen-capture): the recent-apps
// preview is blank and screenshots are blocked — otherwise the preview would
// show the app's content to anyone holding the phone, lock or no lock.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { outcomeOf, type AuthOutcome } from '@/lib/appLockLogic';

const ENABLED_KEY = 'applock:enabled';
const SECURE_KEY = 'applock';

type Listener = (enabled: boolean) => void;
const listeners = new Set<Listener>();

// Unreadable storage fails OPEN (not locked): a lock nobody can read the state
// of would otherwise trap the user out of their own data.
export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLockEnabled(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    // Not persisted: the lock simply stays as it was next launch.
  }
  listeners.forEach((fn) => {
    try {
      fn(on);
    } catch {
      // a listener's error must not break the toggle
    }
  });
}

// The gate follows toggles made while the app is running.
export function onLockEnabledChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Does the phone have a screen lock (any kind) the app can ask for?
export async function lockAvailable(): Promise<boolean> {
  try {
    // PIN/pattern/password count (SECRET), not only biometrics.
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function authenticate(promptMessage: string, cancelLabel: string): Promise<AuthOutcome> {
  try {
    if (!(await lockAvailable())) return 'unavailable';
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: false, // PIN/pattern when the fingerprint doesn't work
    });
    return outcomeOf(result as { success: boolean; error?: string });
  } catch {
    return 'cancelled';
  }
}

// Blank recents preview + no screenshots while the lock is on.
export async function applyScreenSecurity(on: boolean): Promise<void> {
  try {
    if (on) await preventScreenCaptureAsync(SECURE_KEY);
    else await allowScreenCaptureAsync(SECURE_KEY);
  } catch {
    // no native module (Expo Go): nothing to secure
  }
}
