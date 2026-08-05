// Tam ekran (interstitial) reklamın SIKLIK KAPISI — saf mantık, React'siz/native
// modülsüz test edilebilir (timerLogic.ts ile aynı gerekçe).

// lastShownAt: bu cihazda reklamın en son gösterildiği an (epoch ms).
//   null = bu cihazda HİÇ kayıt yok — ya gerçekten ilk kontrol, ya da AsyncStorage
//   temizlendi. Bu durumda ÇAĞIRAN "az önce gösterilmiş gibi" davranıp timestamp'i
//   şimdiyle tohumlamalı ama reklamı GÖSTERMEMELİ (bkz. ads.ts) — ilk kurulumda,
//   kullanıcı uygulamayı daha tanımadan tanıtım/giriş ekranlarının hemen ardından
//   tam ekran reklamla karşılaşmasın diye.
export function shouldShowInterstitial(
  lastShownAt: number | null,
  now: number,
  minGapMs: number
): boolean {
  if (lastShownAt === null) return false;
  return now - lastShownAt >= minGapMs;
}
