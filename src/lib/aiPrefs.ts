// "AI ile hızlı ekleme" tercihi — AsyncStorage'da kalıcı, varsayılan KAPALI.
// Bilinçli varsayılan: bu özellik açıkken yazdığın metin Google'ın Gemini
// API'sine gider (bkz. aiTaskParser.ts) — "hiçbir veri cihazdan çıkmaz" ilkesinin
// TEK istisnası, bu yüzden açık seçim (opt-in) olmalı, gizlice açık gelmemeli.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ai:quickAddEnabled';

export async function isAiQuickAddEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === '1';
}

export async function setAiQuickAddEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, value ? '1' : '0');
}
