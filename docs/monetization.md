# Erek Plus — gelir modeli ve kurulum

Kod tarafı hazır (`src/plus/*`, `app/plus.tsx`). Satın almanın gerçekten çalışması için
aşağıdaki mağaza/RevenueCat kurulumu gerekir. **Anahtar girilmezse** uygulama bugünkü gibi
çalışır: her şey açık, ücretsiz sınırlar uygulanmaz, Profil'de Plus satırı görünmez.

## Kademeler

| | Ücretsiz (reklamlı) | Reklamsız (tek sefer) | Plus (abonelik) |
|---|---|---|---|
| Alışkanlık / görev / hedef sayısı | sınırsız | sınırsız | sınırsız |
| Seri, rozet, dışa/içe aktarma, uygulama kilidi, hesap silme, sesli görev | ✓ (hep) | ✓ | ✓ |
| İstatistik grafikleri | yalnız Gün (son 30 gün) | Gün | Gün/Hafta/Ay |
| Takvimde geri gitme | 1 ay | 1 ay | sınırsız |
| Hatırlatıcı / öğe | 1 | 1 | 5 |
| Arkadaş | 1 | 1 | sınırsız |
| Widget | Bugün + Hızlı ekle | aynı | hepsi (Sayaç, Görevler, Hedefler, Evet/Hayır ve Sayaç düğmeleri dahil) |
| Vurgu rengi | pine, terracotta, ink | aynı | hepsi |
| Yazı tipi | telefonunki | aynı | hepsi |
| Reklam | var | **yok** | **yok** |

Sınırlar `src/plus/plusLogic.ts` içinde sabit olarak durur (`FREE_*`).

**Tanıtım süresi:** Satın alma yapabilen ilk sürümün ilk açılışından itibaren 30 gün her şey
açıktır (yeni ve eski kullanıcılar için), kimse kilitli uyanmasın diye. Sayaç cihazda
(`plus:introStart`) tutulur.

**Çevrimdışı:** Mağazanın son cevabı cihazda önbelleğe alınır; dönem bitişinden sonra 3 gün
tolerans vardır.

## Fiyatlar (Play Console'da ülkeye göre girilir)

| | ABD | AB | Türkiye |
|---|---|---|---|
| Reklamsız (tek sefer) | $3.99 | €3.99 | ₺119,99 |
| Plus aylık | $2.99 | €2.99 | ₺49,99 |
| Plus yıllık (7 gün ücretsiz deneme) | $19.99 | €19.99 | ₺299,99 |

## Kurulum adımları

1. **Play Console › Gelir elde etme**
   - Abonelik `erek_plus`: temel planlar `monthly` (aylık) ve `yearly` (yıllık); yıllığa
     "yeni müşteriler için 7 gün ücretsiz deneme" teklifi.
   - Tek seferlik ürün (uygulama içi, tüketilmez) `erek_ads_free`.
   - Fiyatları yukarıdaki tabloya göre ülke bazında gir.
2. **RevenueCat**
   - Projeye Android uygulaması ekle (`com.erek`) ve Play servis hesabı kimlik bilgisini yükle.
   - Ürünleri içe aktar.
   - Entitlement'lar: **`plus`** → aylık + yıllık ürünler; **`ads_free`** → `erek_ads_free`.
   - Offering (current): paketler `$rc_monthly`, `$rc_annual`, `$rc_lifetime`
     (`$rc_lifetime` = reklamsız ürünü; uygulama onu "yalnızca reklamsız" kartı olarak gösterir).
   - Public SDK key'i (`goog_...`) al.
3. **EAS**: anahtarı `production` ortamına `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` olarak ekle
   (yerelde `.env`; Windows yerel build için bkz. hafıza notu "Erek yerel build").
4. **Native yeniden derleme gerekir** (`react-native-purchases` eklendi).
5. **Test**: Play Console › Lisans testi'ne test hesabını ekle, dahili test sürümü yükle;
   satın alma, deneme, iptal, geri yükleme ve "abonelik bitince kilitlenme"yi dene.
6. **Mağaza kaydı**: Veri güvenliği tablosu ve gizlilik politikası güncellendi
   (`docs/store-listing.md`, `docs/privacy-policy.md`); gizlilik sayfasını yeniden üret:
   `node scripts/build-privacy-html.js`, sonra privacy deposuna yükle.

## Gizlilik

RevenueCat'e Erek hesabı kimliği **gönderilmez**; kendi rastgele anonim kimliğini kullanır.
Satın alma Google hesabına bağlıdır ("Satın alımları geri yükle").

## Maliyet notu

Şu an tüm hizmetler ücretsiz planda (Supabase, EAS, Sentry). İlk beklenen gider Supabase Pro
(~25 $/ay). Play komisyonu: abonelikte %15.
