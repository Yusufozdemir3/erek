Sen bu işte bana adım adım yol gösteren bir yardımcısın. Konu: Android uygulamam **Erek**'e Google Play üzerinden abonelik ve tek seferlik satın alma kurmak (Play Console + RevenueCat). Türkçe, sade ve samimi konuş; resmiyet istemiyorum. Bir adımı anlatırken ekranda tam olarak hangi menüye/butona basacağımı söyle, bilmediğin ya da değişmiş olabileceğini düşündüğün yerde bunu açıkça söyle (arayüzler sık değişiyor, güncel dokümana bakabiliyorsan bak).

## Uygulama (kısaca)
- Erek: alışkanlık + görev + hedef takip uygulaması. Expo SDK 53 / React Native 0.79 / TypeScript. Paket adı `com.erek`. Şu an Play'de sürüm **1.2.0 (versionCode 16)**, yeni gönderildi.
- Kullanıcı verisi cihazda SQLite, isteğe bağlı Google ile girişle Supabase'e eşitleniyor. Analitik yok, çökme raporu için Sentry (kişisel veri temizleniyor). AdMob reklamı var (AD_ID izni manifestte).
- Sahibi tek kişi (ben), bireysel geliştirici hesabı. Para kazanma şu an **kapalı**: kodda hazır ama RevenueCat anahtarı girilmediği için yayındaki sürümde her şey açık, Plus ekranı görünmüyor.
- Kütüphane: `react-native-purchases` 9.2.0 (RevenueCat). Yayındaki AAB'lerin manifestinde BILLING izni var (bu kütüphaneden geliyor), ama Play Console'da henüz hiç ürün tanımlamadım.

## Planlanan gelir modeli
Üç kademe:
1. **Ücretsiz (reklamlı):** sınırsız alışkanlık/görev/hedef; istatistik yalnız "Gün" görünümü, takvimde 1 ay geri; öğe başına 1 hatırlatıcı; 1 arkadaş; yalnız Bugün + Hızlı ekle widget'ları; 3 vurgu rengi; yazı tipi telefonunki.
2. **Reklamsız (tek seferlik, tüketilmez):** yalnızca reklamı kaldırır, başka bir şey açmaz.
3. **Plus (abonelik):** reklamsız + tam istatistik (Gün/Hafta/Ay) + sınırsız takvim geçmişi + öğe başına 5 hatırlatıcı + sınırsız arkadaş/ortak hedef + tüm widget'lar + tüm renk ve yazı tipleri. Plus için ömür boyu seçeneği YOK (sunucu maliyeti sürekli).

Asla kilitlenmeyenler: seri/rozetler, temel takip, dışa/içe aktarma, uygulama kilidi, hesap silme.
Tanıtım süresi: satın alma yapabilen ilk sürümün ilk açılışından itibaren 30 gün herkese her şey açık. Çevrimdışı: son mağaza cevabı önbelleğe alınır, dönem bitişinden sonra 3 gün tolerans.

## Ürün kimlikleri ve fiyatlar (kodla uyumlu, değiştirme)
- Abonelik ürünü: `erek_plus`, temel planlar `monthly` ve `yearly`. Yıllığa "yeni müşteriler için 7 gün ücretsiz deneme" teklifi.
- Tek seferlik ürün: `erek_ads_free`.
- RevenueCat: entitlement'lar `plus` (aylık + yıllık) ve `ads_free` (`erek_ads_free`). Current offering paketleri: `$rc_monthly`, `$rc_annual`, `$rc_lifetime` (`$rc_lifetime` = reklamsız ürün; uygulama onu "yalnızca reklamsız" kartı yapıyor).
- Fiyatlar:
  | | ABD | AB (KDV dahil) | Türkiye |
  |---|---|---|---|
  | Reklamsız | $3.99 | €3.99 | ₺119,99 |
  | Plus aylık | $2.99 | €2.99 | ₺49,99 |
  | Plus yıllık | $19.99 | €19.99 | ₺299,99 |
  Diğer ülkeler: Play'in otomatik/satın alma gücü fiyatlaması ya da 3 kademe. TL fiyatını 3 ayda bir gözden geçireceğim.
- Uygulama tarafı: RevenueCat'in **Public SDK key**'i (`goog_...`) `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` ortam değişkeniyle build'e giriyor. Anahtar yoksa her şey açık kalıyor.
- Gizlilik: RevenueCat'e Erek hesap kimliğini göndermiyorum, kendi rastgele anonim kimliğini kullanıyor. Satın alma Google hesabına bağlı ("Satın alımları geri yükle" düğmesi var).

## Senden istediğim
Beni sırayla şu işlerden geçir, her adımı bitirdiğimi onaylamadan sonrakine geçme:
1. **Ön koşullar:** Play Console'da satıcı/ödeme profili, vergi bilgileri (Türkiye + ABD/AB), banka hesabı, bireysel hesap için gerekenler. Eksik varsa neyi nasıl tamamlayacağım.
2. **Play Console'da ürünleri oluşturma:** abonelik `erek_plus` (monthly/yearly planları, 7 günlük yıllık deneme teklifi, ülke bazlı fiyatlar, yenileme ve ödemesi gecikmiş durum ayarları) ve tek seferlik `erek_ads_free`. Her alanda ne yazacağımı söyle. İsim/açıklama için TR/EN/DE kısa, dürüst metin öner.
3. **RevenueCat kurulumu:** proje, Android uygulaması (`com.erek`), Play servis hesabı (Google Cloud'da servis hesabı, Play Console'da yetki, RevenueCat'e JSON yükleme), ürünleri içe aktarma, entitlement ve offering ayarı, Public SDK key'i nereden alacağım. (Gizli anahtarları sohbete yapıştırmamam gerektiğini hatırlat; yalnız ekran görüntüsü ve hata metinleri paylaşırım.)
4. **Test:** lisans test hesabı, dahili test kanalına sürüm yükleme, satın alma / deneme / iptal / geri yükleme / "abonelik bitince kilitlenme" senaryolarını nasıl deneyeceğim. Play'in test aboneliklerinin süre hızlandırmasını da anlat.
5. **Yayın öncesi beyanlar:** Veri güvenliği formunda "satın alma" ve RevenueCat için ne işaretleyeceğim, gizlilik politikasına eklenecek cümleler, mağaza açıklamasında abonelik bilgilendirmesi, Play'in abonelik politikası gereklilikleri (iptal bilgisi, deneme süresi gösterimi vb.).
6. **Riskler ve sıra:** neyi ilk yapmalıyım (ürünlerin görünmesi için Play'de yayında bir sürüm gerekiyorsa söyle), iade/iptal, Türkiye'de fiyat/vergi tuzakları, Google'ın komisyonu (abonelikte %15 varsayıyorum, doğrula).

Bir yerde takılırsam ekran görüntüsü ya da hata metni yapıştıracağım; ona göre devam et. Başlamadan önce, işi doğru yapman için bana sorman gereken kritik bir şey varsa en fazla 3 soruda sor, yoksa doğrudan 1. adımla başla.
