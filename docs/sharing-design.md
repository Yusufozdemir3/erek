# Paylaşım / accountability — tasarım notu

**Durum (2026-09-30):** Üç faz da kodlandı (bağlantı, alışkanlık paylaşımı,
ortak görev); iki gerçek hesapla cihaz testi bekliyor.

Bu not 2026-07-23 tarihli ilk taslağın yerini alır. O taslaktaki kararlar
(e-postayla davet, tür bazlı kapsam, paylaşım başına görüntüle/düzenle yetkisi)
2026-09-30'da kullanıcı kararıyla değişti:

| Konu | Karar |
|---|---|
| Bağlantı | **Davet kodu** (e-posta araması yok → hesap varlığı sızmaz) |
| Kapsam | **Öğe bazlı**: tek bir alışkanlık / tek bir görev paylaşılır |
| Alışkanlık | Arkadaş **tam geçmişi / ısı haritasını salt okunur** görür ("beni izleyen kişi" modeli; ortak alışkanlık değil). Arkadaşın kendi listesine ve istatistiklerine karışmaz. |
| Görev | Arkadaş görevi kendi listesinde görür, **yalnızca tamamlandı işaretler**. Başlık/tarih/silme sahipte. |
| Hatırlatmalar | Paylaşılmaz (her cihaz yalnız kendi hatırlatmalarını kurar). |

Kod: `supabase/schema.sql` (FRIENDS / SHARING bölümleri, faz 1-3),
`src/sync/friends.ts`, `sharedHabits.ts`, `sharedTasks.ts`, `sharingErrors.ts`,
`src/ui/sharedTaskUi.ts`, `app/friends.tsx`, `app/shared-habit/[id].tsx`,
`src/ui/habit/HabitShareSection.tsx`; yerel `migration020`. Güvenlik
doğrulaması: `supabase/tests/sharing_checks.sql` (SQL Editor'de, kendini geri alır).
Kilit kararlar, kaybolmasınlar diye:

## Değişmez ilkeler

1. **Pull `user_id` ile filtrelemiyor, görünürlük tamamen RLS'te.** Bir tablonun
   SELECT policy'sini genişletmek, satırı karşı tarafın genel pull'una düşürür
   ve `applyRemoteRow` onu karşı tarafın kendi verisi gibi yazar. Bu yüzden
   **alışkanlık paylaşımı `habits`/`habit_logs` RLS'ine dokunmaz**; veri
   doğrulama yapan SECURITY DEFINER RPC'lerle, yalnız gerekli kolonlarla gelir.
2. **Başkasının satırı asla push edilmez.** Edilirse RLS reddeder ve senkron o
   tablodan itibaren kalıcı kilitlenir (`isOwnershipConflict` sınıfı). Görevde:
   yerel-özel `shared_owner_uid` kolonu + `pushTable`'da SQL filtresi + repo
   korumaları (throw değil no-op).
3. **Push yolundaki server trigger'ları raise etmez, düzeltir.**
4. **Geri alma için tombstone gelmez** (satır sadece görünmez olur) → pull sonrası
   "hâlâ paylaşılanlar" uzlaştırması; yalnız yerelde paylaşılan satır varsa çalışır.
5. Hesap değişimi / çıkış öncesi başkasına ait yerel satırlar ve `shared:*`
   önbellekleri silinir.

## Faz 2 — alışkanlık (salt okunur)
`habit_shares(habit_id, owner_id, shared_with_id)`; insert policy sahipliği VE
bağlantıyı doğrular. RPC'ler: `get_shared_habits()`, `get_shared_habit_logs(habit, changed_since)`
(`server_updated_at` ile artımlı). İstemci AsyncStorage `shared:habit:<id>`
önbelleği + saf `computeHabitStats` / `streaks` (repo'dan çıkarılır).

## Faz 3 — ortak görev (yalnız işaretleme)
`tasks.shared_with_id` (ham uid, yerel id'ye eşlenmez) + yerel `shared_owner_uid`.
RLS select sahip VEYA alıcı; update/delete yalnız sahip. Alıcının tek yazma
yolu `toggle_shared_task` RPC. `tasks_sharing_guard` trigger: bağlı olmayan /
tekrarlayan görevde paylaşımı null'lar; `completed_at` için kolon düzeyi
eski-yazma koruması. v1'de tekrarlayan görevler, alt görevler ve hatırlatmalar
paylaşılmaz.

## Yayın etkisi
Gizlilik politikası her fazda güncellenir (Faz 1: görünen ad + fotoğraf).
Play Data Safety beyanı Faz 2/3 ile birlikte gözden geçirilmeli.
