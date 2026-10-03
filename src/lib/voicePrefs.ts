// Voice input preference: has the user agreed to Google's ONLINE speech
// recognition on this device? Asked once, the first time on-device
// recognition isn't possible (see voiceLogic.planVoice); revocable under
// Appearance. Per device on purpose: it's about this phone's capabilities,
// so it isn't synced.

import AsyncStorage from '@react-native-async-storage/async-storage';

const ONLINE_CONSENT_KEY = 'voice:onlineConsent';

export async function getOnlineConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONLINE_CONSENT_KEY)) === '1';
  } catch {
    return false; // unreadable storage = ask again, never assume consent
  }
}

export async function setOnlineConsent(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ONLINE_CONSENT_KEY, value ? '1' : '0');
  } catch {
    // Not persisted: the dialog simply shows up again next time.
  }
}
