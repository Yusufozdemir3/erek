// Dokunsal geri bildirim sarmalayıcısı (expo-haptics).
// Expo Go'da desteklidir; desteklenmeyen ortamda/hata durumunda SESSİZCE yok
// sayılır (uygulamayı asla çökertmez — supabase/sentry ile aynı "eksikse pasif"
// deseni). Anlamsal üç seviye: hafif dokunuş, orta dokunuş, başarı bildirimi.
//
// KULLANICI TERCİHİ: Profil > Titreşim'den kapatılabilir ('haptics:enabled').
// Bu modül React DIŞI ve tap*() çağrıları senkron (render/event handler içinden),
// o yüzden tercih AsyncStorage'dan bir kez okunup modül içinde CACHE'lenir
// (getStoredLang / notificationPrefs ile aynı desen). Açılışta loadHapticsPref()
// çağrılır (bkz. app/_layout.tsx); tercih değişince setHapticsEnabled cache'i
// hemen günceller, böylece sonraki dokunuş anında sessizleşir.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = 'haptics:enabled';

// Varsayılan AÇIK; açılışta kayıtlı tercihle tazelenir.
let enabled = true;

// Açılışta bir kez: kayıtlı tercihi cache'e al.
export async function loadHapticsPref(): Promise<boolean> {
  const v = await AsyncStorage.getItem(HAPTICS_KEY);
  enabled = v === null ? true : v === '1';
  return enabled;
}

// Profil ekranının ilk değeri için (cache'i okur; loadHapticsPref sonrası doğru).
export function isHapticsEnabled(): boolean {
  return enabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value; // cache önce — sonraki dokunuş beklemeden doğru davransın
  await AsyncStorage.setItem(HAPTICS_KEY, value ? '1' : '0');
}

// Küçük etkileşim (checkbox aç/kapa, +/− sayaç).
export function tapLight(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Belirgin eylem (zamanlayıcı başlat).
export function tapMedium(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Olumlu tamamlanma (görev/alışkanlık tamamlandı, hedefe ulaşıldı, süre doldu).
export function notifySuccess(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
