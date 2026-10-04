// When the user last exported their data (this phone only), so the "My data"
// screen can say how old their file is. A date, never the content.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'export:lastAt';

export async function getLastExportDate(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export async function setLastExportDate(ymd: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, ymd);
  } catch {
    // not remembered: the screen just keeps saying "not yet"
  }
}
