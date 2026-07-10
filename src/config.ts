// Uygulama düzeyinde özellik anahtarları.

// Bulut hesabı + senkron özelliği. Kapalı test (MVP) sürümünde KAPALI:
//   - Parola sıfırlama akışı henüz yok; hesabını unutmuş kullanıcı kilitlenmesin.
//   - Kapalıyken uygulama tamamen yerel çalışır: hiçbir veri cihazdan çıkmaz
//     (anonim oturum bile açılmaz), böylece hesap-silme/Data Safety yükü de düşer.
// Herkese açık yayından ÖNCE (parola sıfırlama eklenince) true yapılacak.
// Not: bu anahtar env'den bağımsız kesin kapatmadır; .env'de Supabase tanımlı
// olsa bile senkron başlamaz (bkz. AppData açılış senkronu + profil kartları).
export const ACCOUNTS_ENABLED = false;
