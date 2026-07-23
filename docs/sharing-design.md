# Paylaşım özelliği — tasarım notu (HENÜZ UYGULANMADI)

**Durum:** karar alındı, kod yazılmadı. Kullanıcı kararı (2026-07-23):
- **Yetki:** paylaşım başına seçilir — *görüntüleyen* ya da *düzenleyebilen* (ikisi de olacak)
- **Kapsam:** tür bazında — "görevlerimi X görebilir", "alışkanlıklarımı Y görebilir"
- **Zamanlama:** **yayından SONRA.** Mevcut sürüm Play'e çıkacak, bu bir sonraki sürüm.

Bu dosya kararların ve tuzakların kaybolmaması için var; uygulamaya başlarken
buradan devam edilir.

---

## 1. Neden büyük bir değişiklik

Bugünkü güvenlik modeli **tek sahipli**: buluttaki her politika `auth.uid() = user_id`
kuralına dayanıyor (bkz. `supabase/schema.sql`). "Bu satır senin mi?" sorusunun
cevabı ikili. Paylaşım, bu soruyu "senin mi, yoksa sana açılmış mı?" haline
getiriyor — yani 8 tablonun RLS politikası, pull sorgusu ve push kontrolü
değişiyor.

Yerelde de benzer bir varsayım var: `user_id` cihazın kendi UUID'si ve senkron
sınırında buluttaki uid'e çevriliyor (bkz. `src/sync/syncEngine.ts` başlığı).
"Başkasının satırı" diye bir kavram yok.

**Ön koşul:** paylaşıma başlamadan önce senkronun sahada sağlam çalıştığı
görülmeli. 2026-07-23'te üç ciddi senkron hatası düzeltildi ve hesap değişimi
akışı henüz iki gerçek hesapla test edilmedi (bkz. [[habit-app-durum]] madde 52).
Sağlam olmayan bir temelin üstüne çok kullanıcılı yazma koymak, teşhisi çok zor
hatalar üretir.

---

## 2. Veri modeli

### Bulut: yeni `shares` tablosu

| Kolon | Anlam |
|---|---|
| `id` | uuid |
| `owner_uid` | paylaşan (auth.users) |
| `grantee_uid` | paylaşılan kişi; davet kabul edilene kadar NULL |
| `grantee_email` | davet e-postası (kabul anında uid'e bağlanır) |
| `scope` | `'tasks' \| 'habits' \| 'goals'` — tür bazında kapsam |
| `permission` | `'view' \| 'edit'` |
| `status` | `'pending' \| 'accepted' \| 'revoked'` |
| `created_at` / `updated_at` | |

Karar: kapsam **tür** düzeyinde (öğe düzeyinde değil). Öğe düzeyi daha esnek
olurdu ama her kayıtta paylaşım durumu tutmayı ve her listede ayrı filtre
gerektirirdi; kullanıcı tür bazını seçti.

### Yerel: satırın sahibi kim

Senkronlanan tablolara **`owner_uid TEXT NULL`** eklenir: `NULL` = benim,
dolu = başkasının (paylaşılan). Buna göre:
- Listeler varsayılan olarak yalnız `owner_uid IS NULL` gösterir; paylaşılanlar
  ayrı bir görünümde ("X'in görevleri").
- `synced=0` push kuyruğuna yalnız yazma hakkı olan satırlar girer.

---

## 3. RLS politikaları

Her `hasUserId` tablosu (goals/habits/tasks) için politika şu hale gelir:

- **SELECT:** `auth.uid() = user_id` **VEYA** o türü kapsayan, `accepted`
  durumunda bir paylaşım var
- **INSERT/UPDATE/DELETE:** sahip **VEYA** paylaşım `permission = 'edit'`

Çocuk tablolar (habit_logs, subtasks, goal_milestones, goal_entries, reminders)
bugün de sahipliği ebeveyn üzerinden alıyor — o desen korunur, yalnız ebeveyn
kontrolü paylaşımı da kapsayacak şekilde genişler.

**Dikkat:** politikalar `EXISTS` ile shares tablosuna bakacağı için her sorguda
ek maliyet doğar. `shares(grantee_uid, scope, status)` üzerinde indeks şart.

---

## 4. Senkron motoru değişiklikleri

1. **Pull artık "benim olmayan" satırları da çeker.** Bugün `applyRemoteRow`
   gelen satırın `user_id`'sini kayıtsız şartsız yerel cihaz kimliğine çeviriyor
   — paylaşılan satırda bu YANLIŞ olur (satır bana ait değil). Gelen satırın
   sahibi `owner_uid`'e yazılmalı.
2. **Push filtresi:** `WHERE synced = 0` yetmez; `AND (owner_uid IS NULL OR <yazma hakkım var>)`.
3. **İptal (revoke) sonrası temizlik:** paylaşım kaldırılınca karşı tarafın
   cihazındaki kopyalar SİLİNMELİ. Pull "artık göremediğim satırlar" bilgisini
   üretmez (satır basitçe sonuçtan düşer) → ayrı bir "hâlâ geçerli paylaşımlar"
   sorgusu + yerelde eşleşmeyen `owner_uid` satırlarının temizlenmesi gerekir.
4. **Çevrimdışı düzenleme + iptal yarışı:** düzenleyen kişi çevrimdışıyken
   paylaşım iptal edilirse push RLS'e takılır. Bu yüzey bugün de var
   (`isOwnershipConflict`, 2026-07-23) — aynı desenle anlaşılır bir mesaj
   gösterilmeli, satır sessizce kaybolmamalı.

---

## 5. Davet akışı ve gizlilik

- Davet **e-posta ile** yapılır; karşı tarafın Erek hesabı olmalı.
- **Kullanıcı varlığını sızdırma:** "bu e-posta kayıtlı değil" demek, bir
  e-postanın uygulamayı kullanıp kullanmadığını ifşa eder. Davet, hesabın
  varlığından bağımsız olarak "davet gönderildi" demeli; eşleşme sunucu
  tarafında yapılmalı.
- Davet **kabul edilene kadar hiçbir veri görünmez** (`status='pending'`).
- Paylaşan taraf, kimlerin erişimi olduğunu tek ekranda görmeli ve tek dokunuşla
  iptal edebilmeli.

---

## 6. Arayüz taslağı

- **Profil → Paylaşım:** "Benim paylaştıklarım" (kişi + kapsam + yetki + iptal)
  ve "Benimle paylaşılanlar" (kabul et / reddet / çık).
- **Listelerde görünüm:** Görevler/Alışkanlıklar/Hedefler ekranlarında bir
  seçici — "Benim" / "X'in". Paylaşılan öğede sahibinin adı küçük bir rozet.
- **Düzenleyebilen kişi** için normal etkileşim; **yalnız görüntüleyen** için
  tüm mutasyon noktaları devre dışı (AmountStepper'daki `disabled` deseni
  hazır — bkz. gelecek gün kısıtı).

---

## 7. Yayın/uyumluluk etkisi

Paylaşım açılınca **veri diğer kullanıcılarla paylaşılmış olur**:
- Play **Data Safety** beyanı güncellenmeli ("paylaşılıyor: evet").
- **Gizlilik politikası** güncellenmeli (kiminle, hangi koşulda, nasıl iptal
  edilir, iptal edilince ne olur).
- Her ikisi de bugün "üçüncü taraflarla paylaşılmıyor" diyor; bu ifade
  paylaşım özelliğiyle birlikte doğruluğunu yitirir.

---

## 8. Aşamalandırma önerisi

**Faz 1 — yalnız görüntüleme.** Çakışma, yetki kontrolü ve çevrimdışı yazma
sorunlarının tamamı devre dışı kalır; RLS'e yalnız SELECT genişlemesi gelir.
Riskin çoğu burada yok.

**Faz 2 — düzenleyebilme.** INSERT/UPDATE/DELETE genişlemesi, iptal yarışı,
"kim değiştirdi" bilgisi (opsiyonel) ve yazma hakkı olmayan satırın push
kuyruğuna girmemesi.

Kullanıcı ikisini de istedi; aşamalandırma yalnız **uygulama sırası** önerisidir,
kapsam kısıtlaması değil.

---

## 9. Başlamadan önce cevaplanacaklar

1. Paylaşılan alışkanlıkta **kayıtlar (habit_logs) kimin?** Düzenleyebilen kişi
   benim alışkanlığımı kendi adına mı işaretliyor, benim yerime mi? (Ortak
   alışkanlık ile "beni izleyen kişi" bambaşka ürünler.)
2. Paylaşılan öğeler **karşı tarafın istatistiklerine karışsın mı?** (Puan,
   seri, dönem hedefleri kimin verisinden hesaplanacak.)
3. Bildirimler: paylaşılan bir görevin hatırlatması karşı tarafta da çalsın mı?
   (Bugün hatırlatmalar tamamen yerel planlanıyor.)
