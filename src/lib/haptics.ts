// Dokunsal geri bildirim sarmalayıcısı (expo-haptics).
// Expo Go'da desteklidir; desteklenmeyen ortamda/hata durumunda SESSİZCE yok
// sayılır (uygulamayı asla çökertmez — supabase/sentry ile aynı "eksikse pasif"
// deseni). Anlamsal üç seviye: hafif dokunuş, orta dokunuş, başarı bildirimi.

import * as Haptics from 'expo-haptics';

// Küçük etkileşim (checkbox aç/kapa, +/− sayaç).
export function tapLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// Belirgin eylem (zamanlayıcı başlat).
export function tapMedium(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

// Olumlu tamamlanma (görev/alışkanlık tamamlandı, hedefe ulaşıldı, süre doldu).
export function notifySuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
