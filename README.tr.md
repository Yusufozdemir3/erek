*Diğer diller: [English](README.md)*

# Erek

Erek; Expo ve React Native ile geliştirilmiş, offline-first çalışan bir alışkanlık, görev ve hedef takip uygulamasıdır. Hesap gerektirmez, takip içermez, verini asla satmaz.

## Özellikler

- **Alışkanlıklar** — üç tip: basit (yaptın/yapmadın), sayısal (günlük miktar hedefi, örn. 8 bardak su) ve zamanlayıcılı (örn. 20 dakika meditasyon). Sıklığı sen belirlersin (her gün, haftanın belirli günleri, her X günde bir, haftada X kez); her alışkanlığa simge ve renk verebilirsin.
- **Seriler ve rozetler** — seri sayısı her zaman alışkanlık loglarından hesaplanır, hiçbir yerde saklanmaz. 7, 30, 100 ve 365 günde rozet kazanılır.
- **İstatistikler** — her alışkanlık için puan grafiği, dönem hedefleri (bugün/hafta/ay/3 ay/yıl), aylık takvim ve sayısal/zamanlayıcılı alışkanlıklar için geçmiş grafiği.
- **Görevler** — öncelik, son tarih ve saat, alt görevler; tekrarlayan görevler tamamlandığında otomatik olarak bir sonraki tarihe taşınır.
- **Hedefler** — sayısal hedefler (örn. 200 sayfa oku) ya da adım listesi, hız/tahmini bitiş tarihi projeksiyonlarıyla birlikte. Bir alışkanlık bir hedefe bağlanabilir; alışkanlık her tamamlandığında hedef kendiliğinden ilerler.
- **Hatırlatmalar** — alışkanlık, görev ve hedefler için yerel bildirimler; ses ve titreşim ayarlanabilir.
- **Ana ekran widget'ı** — bugünkü görev ve alışkanlıkları gösteren Android widget'ı.
- **Reklamlar** — uygulama ön plana her getirildiğinde en fazla 30 dakikada bir gösterilen tam ekran (interstitial) AdMob reklamı; kurulumdan/onboarding'den hemen sonra ya da bir alışkanlık/görev tamamlandığında asla gösterilmez.
- **Görünüm** — açık, koyu (iki farklı ton) ve sistem teması, seçilebilir vurgu rengi.
- **Diller** — Türkçe, İngilizce ve Almanca.
- **İsteğe bağlı bulut senkronu** — Google hesabınla giriş yaparak verilerini Supabase üzerinden yedekleyip cihazlar arasında eşitleyebilirsin; tamamen isteğe bağlıdır ve hesabını (buluttaki tüm verinle birlikte) uygulama içinden kalıcı olarak silebilirsin.

## Mimari kararlar

- **Offline-first.** Her şey önce cihazdaki SQLite'a yazılır. İnternet olmadan tam çalışır.
- **UI asla SQL görmez.** Ekranlar yalnızca repository fonksiyonlarını çağırır (`taskRepo.create()` gibi). Bu, ileride veritabanını değiştirsek bile UI'ı kırmaz.
- **UUID kimlikler.** ID'leri cihaz üretir; internetsizken oluşturulan kayıtlar buluttakiyle çakışmaz.
- **Son yazan kazanır + soft delete.** Her kayıtta `updated_at` (çakışma çözümü) ve `deleted_at` (silinen kayıt işaretlenir, gerçekten silinmez) var — bulut senkronunu mümkün kılan da budur.
- **Streak saklanmaz, hesaplanır.** Seri sayısı her zaman alışkanlık loglarından türetilir — tek doğru kaynak loglar.

## Teknoloji yığını

- [Expo](https://expo.dev) / React Native, dosya tabanlı navigasyon için [expo-router](https://docs.expo.dev/router/introduction/)
- Cihaz üstü, offline-first veritabanı için [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- İsteğe bağlı hesap tabanlı bulut senkronu için [Supabase](https://supabase.com) (bkz. `supabase/schema.sql`)
- Her yerde TypeScript
- Testler için Jest — `logic` projesi (veri katmanı, senkron, i18n) ve `ui` projesi (React Native bileşenleri) olarak ikiye ayrılmıştır

## Klasör yapısı

```
app/                          Ekranlar ve navigasyon (expo-router)
src/
  types/models.ts              Tüm veri tipleri
  lib/                          Ortak yardımcılar (tarih, sentry, reklam vb.)
  db/
    database.ts                Bağlantı + migration çalıştırıcı
    index.ts                   Veri katmanının tek giriş noktası
    migrations/                 Şema migration'ları
    repositories/               task/habit/goal/reminder/subtask/user repo'ları
  sync/                         İsteğe bağlı Supabase bulut senkron motoru
  i18n/                         Türkçe / İngilizce / Almanca çeviriler
  ui/                           Ekranların yapı taşları (formlar, grafikler, modallar…)
  widget/                       Android ana ekran widget'ı
  web/                          Yalnızca native modüller için web stub'ları
modules/                       Özel native Expo modülü (bildirim kanalları)
plugins/                       Expo yapılandırma eklentileri
supabase/schema.sql            Bulut veritabanı şeması
docs/                          Mağaza metni, gizlilik politikası, kurulum rehberleri
```

## Kurulum

```bash
npm install
cp .env.example .env   # isteğe bağlı: Supabase / Google girişi / Sentry / AdMob anahtarlarını doldur
npm run typecheck      # tip kontrolü
npm test                # tüm testleri çalıştır
npm start               # Expo'yu başlatır (telefonda Expo Go ile aç ya da android/ios çalıştır)
```

Uygulama hiçbir `.env` değeri olmadan da tam çalışır — bulut senkronu, Google girişi ve çökme raporlama isteğe bağlıdır ve yapılandırılana kadar devre dışı kalır. Reklamlar Google'ın test reklam birimiyle kutudan çıktığı gibi çalışır (gelir üretmez); gerçek gelir için `.env` dosyasına `EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID` değerini gir. Her değişkenin ne işe yaradığı için `.env.example` dosyasına bak.

> Not: `expo-sqlite` ve `expo-crypto` gerçek cihazda/emülatörde çalışır; web önizlemesinde SQLite kısıtlıdır.

## Kullanım örneği

```ts
import { initDataLayer, taskRepo, habitRepo } from '@/db';

const { user } = await initDataLayer();

// Görev ekle
taskRepo.create({ user_id: user.id, title: 'Sunumu bitir', priority: 'high', due_date: '2026-07-01' });

// Alışkanlık ekle ve bugünü işaretle
const habit = habitRepo.create({ user_id: user.id, title: 'Su iç', remind_at: '09:00' });
habitRepo.toggleLog(habit.id, '2026-06-28', true);
console.log(habitRepo.currentStreak(habit.id)); // 1
```

## Dokümantasyon

- `docs/store-listing.md` — mağaza metni (özellik açıklamaları için tek doğru kaynak)
- `docs/privacy-policy.md` — gizlilik politikası
- `docs/google-signin-setup.md` — Google girişi kurulumu
- `docs/sharing-design.md` — paylaşım özelliği tasarım notları
