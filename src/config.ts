// Uygulama düzeyinde özellik anahtarları.

// Bulut hesabı + senkron özelliği. ARTIK AÇIK.
// Kapalı olma gerekçesi "parola sıfırlama akışı yok, hesabını unutan kullanıcı
// kilitlenmesin" idi; giriş YALNIZCA Google ile yapıldığı için (bkz.
// ui/LoginScreen.tsx) ortada parola yok, dolayısıyla o kilitlenme de yok.
// AÇIKKEN NE DEĞİŞİR — yayın öncesi kontrol listesi:
//   - Veri cihazdan ÇIKAR — AMA YALNIZCA KULLANICI GİRİŞ YAPTIYSA. Giriş yoksa
//     senkron hiç başlamaz: ensureSignedIn oturum açmaz, null döner (bkz.
//     sync/auth.ts). Bu, gizlilik politikası §1 ile giriş ekranındaki sözün
//     ('login.localNote') kodda karşılığıdır — değiştirilirse üçü birlikte
//     değiştirilmeli. Play Console'daki Data Safety beyanı da buna göre:
//     veri toplama "isteğe bağlı" (optional) olarak işaretlenmeli.
//   - Hesap silme zorunluluğu devreye girer; akış hazır (deleteAccountAndData +
//     sunucudaki delete_account RPC'si), Play'in hesap silme formunda beyan edilmeli.
//   - Giriş ekranı ilk açılışta bir kez gösterilir ("Şimdilik geç" ile atlanabilir);
//     giriş yapılmazsa uygulama eskisi gibi tamamen yerel çalışmaya devam eder.
// Not: bu anahtar env'den bağımsızdır ama TEK BAŞINA yetmez — .env'de Supabase
// (ve Google girişi için EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) tanımlı değilse
// senkron ve giriş düğmesi yine devre dışı kalır.
export const ACCOUNTS_ENABLED = true;
