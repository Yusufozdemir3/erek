// Uygulama düzeyinde özellik anahtarları.

// Bulut hesabı + senkron özelliği. ARTIK AÇIK.
// Kapalı olma gerekçesi "parola sıfırlama akışı yok, hesabını unutan kullanıcı
// kilitlenmesin" idi; giriş YALNIZCA Google ile yapıldığı için (bkz.
// ui/LoginScreen.tsx) ortada parola yok, dolayısıyla o kilitlenme de yok.
// AÇIKKEN NE DEĞİŞİR — yayın öncesi kontrol listesi:
//   - Veri cihazdan ÇIKAR (Supabase senkronu). Play Console'daki Data Safety
//     beyanı buna göre güncellenmeli.
//   - Hesap silme zorunluluğu devreye girer; akış hazır (deleteAccountAndData +
//     sunucudaki delete_account RPC'si), Play'in hesap silme formunda beyan edilmeli.
//   - Giriş ekranı ilk açılışta bir kez gösterilir ("Şimdilik geç" ile atlanabilir);
//     giriş yapılmazsa uygulama eskisi gibi tamamen yerel çalışmaya devam eder.
// Not: bu anahtar env'den bağımsızdır ama TEK BAŞINA yetmez — .env'de Supabase
// (ve Google girişi için EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) tanımlı değilse
// senkron ve giriş düğmesi yine devre dışı kalır.
export const ACCOUNTS_ENABLED = true;

// "AI ile hızlı ekleme" (doğal dil → görev) + ona bağlı SESLİ GİRİŞ.
// Kapalı test sürümünde KAPALI. Gerekçe güvenlik/maliyet:
//   - Sunucu ucu (supabase/functions/parse-task) fiilen kimliksizdi: anon key
//     APK'ya gömülü olduğundan çıkaran herkes çağırabiliyordu. Kota ve girdi
//     uzunluğu sınırı da yoktu → Gemini faturası sınırsız şişirilebilir, hatta
//     uç nokta genel amaçlı bir LLM proxy'sine çevrilebilirdi.
//   - Doğru çözüm kimliği bir ŞEYE bağlamaktır (aktif abonelik): o zaman kötüye
//     kullanmak para ödemeyi gerektirir ve suistimal eden tek uid banlanabilir.
//     Bu da hesap altyapısı ister (bkz. ACCOUNTS_ENABLED) — o yüzden özellik
//     premium mimarisi netleşene kadar bekliyor.
// Kapalıyken uygulama gerçekten tamamen yerel çalışır: hiçbir metin cihazdan
// çıkmaz. Sesli giriş de kapanır — AddSheet'te AI akışının içinde yaşıyor.
// KOD SİLİNMEDİ (aiTaskParser/voiceInput/aiPrefs + testleri duruyor); geri açmak
// bu bayrağı true yapmaktır.
//
// ⚠ BU BAYRAK TEK BAŞINA GÜVENLİK AÇIĞINI KAPATMAZ: parse-task Supabase'de
// DEPLOY EDİLİ kaldığı sürece anon key'i olan herkes onu çağırmaya devam eder.
// Uç noktanın sunucudan silinmesi + GEMINI_API_KEY'in iptali ŞARTTIR.
export const AI_QUICK_ADD_ENABLED = false;
