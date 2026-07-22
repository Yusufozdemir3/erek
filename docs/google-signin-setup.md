# Google ile giriş — kurulum

Kod tarafı hazır ([src/sync/auth.ts](../src/sync/auth.ts), [src/ui/LoginScreen.tsx](../src/ui/LoginScreen.tsx)).
Çalışması için Google Cloud ve Supabase tarafında yapılması gereken, koda
yazılamayan adımlar aşağıda. Sırayı bozma — 2. adım 1'in çıktısını ister.

Bu projeye özel sabitler:

| | Değer |
|---|---|
| Android paket adı | `com.erek` |
| iOS bundle | `com.erek` |
| URL scheme | `habitapp` |
| Debug keystore SHA-1 | `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` |

---

## 1. Google Cloud Console — iki OAuth istemcisi

`APIs & Services > Credentials > Create credentials > OAuth client ID`.
İlk kez giriyorsan önce `OAuth consent screen`'i doldurman istenir (External,
uygulama adı, destek e-postası; test aşamasında "Testing" modu yeterli, kendi
Google hesabını test kullanıcısı olarak ekle).

**a) Web application** — Supabase bunu kullanır.
- Tür: `Web application`
- Authorized JavaScript origins: **boş bırak** (tarayıcı içi akışlar için, bize gerekmiyor)
- Authorized redirect URIs → URIs 1, bu projenin gerçek adresi:

  ```
  https://jailpwtcodifcnblafco.supabase.co/auth/v1/callback
  ```

  (`.env`'deki `EXPO_PUBLIC_SUPABASE_URL` + `/auth/v1/callback`. Yer tutucuyu
  aynen yapıştırmak Google'da "The attempted action failed" hatası verir —
  hata mesajı sebebi söylemez.)
- Çıktı: **Client ID** + **Client secret** → 2. ve 3. adımda kullanılır.

**b) Android** — cihazdaki hesap seçicinin çalışması için.
- Tür: `Android`
- Package name: `com.erek`
- SHA-1: uygulamayı GERÇEKTEN imzalayan anahtarın parmak izi (aşağıya bak)
- Çıktı: bu istemcinin ID'si **hiçbir yere yazılmaz**; sadece Google tarafında
  tanımlı olması yeterli.

### Hangi SHA-1?

⚠ **En sık yapılan hata:** yalnız Play'in imza SHA-1'ini kaydetmek. O parmak izi
SADECE mağazadan inen sürüm için geçerlidir — Play, yüklediğin AAB'yi kendi
anahtarıyla YENİDEN imzalar. Yerel derlemede o adım hiç olmadığı için APK debug
anahtarıyla imzalı kalır ve giriş `DEVELOPER_ERROR` ile patlar (2026-07-22'de
tam olarak bu yaşandı).

**İkisini birden kaydet.** Konsolda `Add fingerprint` varsa aynı istemciye ekle;
yoksa aynı paket adıyla (`com.erek`) ikinci bir Android istemcisi oluştur —
aynı pakete farklı parmak izleriyle birden fazla istemci normaldir.

Bir APK'nın gerçek imzasını doğrulamak için:

```bash
"$ANDROID_HOME/build-tools/35.0.0/apksigner.bat" verify --print-certs <apk>
```


| Nereden yüklediğin APK | SHA-1 kaynağı |
|---|---|
| Yerel derleme (`expo run:android`, yerel AAB) | yukarıdaki debug SHA-1 |
| Play Store / internal testing | **Play Console > Test and release > Setup > App signing**, oradaki "App signing key certificate" SHA-1 |
| EAS build | `eas credentials` → Android → keystore bilgisi |

Play App Signing devredeyse Play uygulamayı kendi anahtarıyla yeniden imzalar;
o yüzden mağazadan inen sürüm için Play Console'daki SHA-1 **şarttır**, yerel
anahtarınki yetmez. En sık yaşanan "yerelde çalışıyor, Store sürümünde
`DEVELOPER_ERROR`" hatasının sebebi budur.

Kendi anahtarının SHA-1'ini okumak için:

```bash
keytool -list -v -keystore <anahtar.jks> -alias <alias>
```

## 2. Supabase — Google sağlayıcısı

`Authentication > Providers > Google`:
- Enable → açık
- Client ID / Client secret: **1a**'daki WEB istemcisinin değerleri
- Kaydet

## 3. Proje `.env`

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<1a'daki WEB istemci ID'si>
```

⚠ Buraya **Android** istemcisinin ID'si yazılırsa giriş sunucuda reddedilir:
Supabase gelen ID token'ın `audience` alanını kendi yapılandırmasındaki web
istemcisiyle karşılaştırır. Hata mesajı bunu açık etmez, saatler yakar.

`.env` değişince Expo'yu temiz başlat: `npx expo start -c`

## 4. Yeniden derleme

Yeni bir native paket (`@react-native-google-signin/google-signin`) eklendi;
mevcut APK ile çalışmaz.

```bash
npx expo prebuild
```

sonra her zamanki yerel Gradle akışın.

## 5. Özelliği aç

[src/config.ts](../src/config.ts):

```ts
export const ACCOUNTS_ENABLED = true;
```

Bu bayrak kapalıyken giriş ekranı hiç çizilmez. Açmadan önce: bayrağın açılması
bulut senkronu, hesap silme yükümlülüğünü ve Play Data Safety beyanını da
devreye sokar (bkz. config.ts'teki not).

---

## Doğrulama

1. Uygulamayı sil, yeniden kur (giriş kapısı bayrağı `login:seen` sıfırlansın).
2. Tanıtımdan sonra giriş ekranı çıkmalı.
3. "Google ile devam et" → sistem hesap seçici açılmalı.
4. Seçtikten sonra ekran kapanmalı, Profil'de hesap e-postası görünmeli.

### Sık karşılaşılan hatalar

| Belirti | Sebep |
|---|---|
| `DEVELOPER_ERROR` / seçici hemen kapanıyor | Android istemcisinde SHA-1 veya paket adı eşleşmiyor |
| Seçici açılıyor, Supabase reddediyor | `.env`'de web yerine Android client ID |
| Düğme hiç görünmüyor | `.env` boş ya da `ACCOUNTS_ENABLED = false` |
| `Play Services` uyarısı | Emülatörde Google Play olmayan bir sistem imajı |
