# Arkadaş hatırlatmaları (push) — kurulum

Kod hazır: şema (`supabase/schema.sql`, PHASE 5 ve 6), denetimler
(`supabase/tests/nudge_checks.sql`, `supabase/tests/subtask_share_checks.sql`), Edge Function
(`supabase/functions/send-nudge/`) ve uygulama. Aşağıdakiler hesap/konsol işi
olduğu için senin tarafında. **Sıra önemli.** Gizli dosya ve anahtarların
(hizmet hesabı JSON'u, Expo erişim anahtarı) hiçbiri depoya ya da uygulamaya
girmez.

Firebase'in tek görevi bildirimi telefona taşımak (FCM). Veri, kurallar ve
gönderim Supabase'de kalıyor. Android'de kapalı bir uygulamaya bildirim
ulaştırmanın başka güvenilir yolu yok; Supabase'in kendi push hizmeti de yok.

## 1. Firebase projesi ve `google-services.json` (~5 dk)

1. https://console.firebase.google.com → **Create a project / Proje oluştur**.
   Adı yazarken Google girişi için kullandığın Google Cloud projesi önerilirse
   onu seçebilirsin (yeni bir proje de olur). Google Analytics'e gerek yok, kapat.
2. Proje ayarları (⚙️) → **General** → *Your apps* → **Android** simgesi →
   paket adı `com.erek` → *Register app*. SHA-1 alanını boş bırak.
3. **google-services.json**'u indir → proje köküne koy:
   `habit-app/google-services.json`.
   - Gizli değil (yalnız proje kimlikleri, APK'nın içine de girer), ama depoyu
     temiz tutmak için `.gitignore`'da. `app.config.js` dosyayı görünce
     derlemeye kendisi ekler.
   - EAS ile derlenecekse:
     `npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production`
     (aynısını `preview` için de).

> ⚠️ Firebase'li ilk APK'da Google ile girişi de bir kez dene.

## 2. FCM anahtarını Expo'ya yükle (~3 dk)

Expo'nun bildirimi Google üzerinden telefona iletebilmesi için:

1. Firebase → Proje ayarları → **Service accounts** sekmesi → **Generate new
   private key** → **Generate key** → bir JSON iner. **Bu dosya gizli.**
2. Yükle (ikisinden biri):
   - Komutla: `npx eas-cli credentials` → **Android** → **production** →
     **Google Service Account** → **Manage your Google Service Account Key for
     Push Notifications (FCM V1)** → **Set up a Google Service Account Key for
     Push Notifications (FCM V1)** → **Upload a new service account key** →
     JSON'u seç.
   - Siteden: expo.dev → proje → **Project settings → Credentials** → Android →
     `com.erek` → *Service Credentials* → **FCM V1 service account key** →
     **Add a service account key** → JSON'u yükle → **Save**.
3. Yükledikten sonra JSON'u bilgisayarından **sil**.

## 3. Expo erişim anahtarı oluştur (~1 dk)

1. https://expo.dev/settings/access-tokens → **Create token** → bir ad ver
   (ör. `erek-send-nudge`) → değeri kopyala. Bu değer gizli; sonraki adımda
   Supabase'e gireceksin.
2. Aynı sayfadaki **Enhanced Security for Push Notifications** anahtarına HENÜZ
   dokunma. 4. adım bitince açacağız (5. adım).

## 4. Supabase (~5 dk)

1. Panel → **SQL Editor** → `supabase/schema.sql`'in tamamını yapıştır →
   **Run**. PHASE 5 (hatırlatmalar) ve PHASE 6 (ortak görevin alt görevleri)
   eklendi; dosya tekrar çalıştırılabilir. **Şema her değiştiğinde uygulamadan
   ÖNCE yeniden çalıştırılır.**
2. **SQL Editor** → `supabase/tests/nudge_checks.sql` → **Run** → sonuç
   **`ALL NUDGE CHECKS PASSED`**; sonra `supabase/tests/subtask_share_checks.sql`
   → **`ALL SUBTASK SHARE CHECKS PASSED`**. Her biri geri alınan tek işlemde
   çalışır, projede iz kalmaz.
3. Proje ref'ini bul: panel → **Project Settings → General → Reference ID**
   (`EXPO_PUBLIC_SUPABASE_URL`'deki `https://<ref>.supabase.co` kısmı).
4. Fonksiyonu yükle (Docker gerekmez; **fonksiyon değiştiğinde yeniden yüklenir**):
   ```
   npx supabase login
   npx supabase functions deploy send-nudge --project-ref <ref> --use-api
   ```
   `login` tarayıcıda onay ister.
5. Expo anahtarını gizli değer olarak gir:
   ```
   npx supabase secrets set EXPO_ACCESS_TOKEN=<3. adımdaki değer> --project-ref <ref>
   ```
   (Ya da panel → **Edge Functions → Edge Function Secrets** → Key:
   `EXPO_ACCESS_TOKEN`, Value: anahtar → **Save**.)

## 5. Push güvenliğini aç (~1 dk)

https://expo.dev/settings/access-tokens → **Enhanced Security for Push
Notifications** → aç. Bundan sonra Expo yalnızca bu anahtarı taşıyan
gönderimleri kabul eder: biri bir telefonun bildirim anahtarını ele geçirse
bile o telefona bildirim gönderemez. (Önce 4.5'i yapmamızın sebebi bu; tersi
olursa açtığın an gönderimler `UNAUTHORIZED` ile düşer.)

## 6. Sonra

Bana haber ver: `google-services.json` yerindeyse APK'yı derlerim (vc25,
prebuild gerekiyor). Test için **iki ayrı Google hesabıyla iki telefon** lazım
(A ve B arkadaş olmalı, A bir alışkanlığını B ile paylaşmış olmalı).

### Cihaz testi

- [ ] B, A'nın paylaştığı alışkanlıkta "Arkadaşına hatırlat"a basıyor → A'nın
      telefonuna bildirim geliyor; **telefon kilitliyken içerik gizli** (sistemin
      "içerik gizlendi" ifadesi), **kilidi açınca "B sana bir hatırlatma
      gönderdi" + alışkanlığın adı** görünüyor.
- [ ] A bildirime dokununca kendi alışkanlığının ekranı açılıyor.
- [ ] B aynı alışkanlıkta tekrar basınca "12 saat sonra" açıklaması çıkıyor.
- [ ] A, Arkadaşlar ekranında B'nin zilini kapatıyor → B'ye "hatırlatıldı"
      görünüyor ama A'ya **bildirim gelmiyor**.
- [ ] A, Bildirimler → "Arkadaş hatırlatmaları"nı kapatıyor → aynı sonuç.
- [ ] **A çıkış yapıyor, aynı telefona C giriyor; B, A'ya hatırlatıyor → C'nin
      ekranına bir şey düşmüyor.** Aynısını A uçak modundayken çıkış yapıp
      sonra interneti açarak dene.
- [ ] A bildirim iznini kapatıyor → B'ye "… şu an Erek bildirimi almıyor,
      mesajla hatırlat?" soruluyor, paylaş penceresi açılıyor.
- [ ] Arkadaşlık kaldırılınca hatırlatma gitmiyor.
- [ ] Hesap silinince Supabase'de `push_tokens`, `nudges` ve `nudge_mutes`'ta o
      kullanıcının satırı kalmıyor (Table editor).

### Ortak görevin alt görevleri — cihaz testi

A bir görevi (alt görevleri olan) B ile paylaşır.

- [ ] B'nin Görevler ve Bugün listesinde görev "2/3 alt görev" rozetiyle görünüyor;
      dokununca alt görev listesi açılıyor.
- [ ] B bir alt görevi işaretliyor → A'da (en geç açılışta/yenilemede) aynı alt görev
      işaretli görünüyor.
- [ ] B son alt görevi işaretleyince görev kendiliğinden tamamlanıyor; birini geri
      alınca yeniden açılıyor (A tarafında da).
- [ ] **Paylaşımdan sonra eklenen** ve **paylaşımdan önce zaten var olan** alt
      görevlerin ikisi de B'ye geliyor.
- [ ] A uçak modunda bir alt görevin adını değiştirip sonra bağlanıyor: B'nin
      işareti **silinmiyor**, yeni ad geliyor.
- [ ] Paylaşım kaldırılınca görev ve alt görevleri B'nin listesinden kayboluyor.
