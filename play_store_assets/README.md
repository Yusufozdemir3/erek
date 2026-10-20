# Erek — Play Store telefon ekran görüntüleri

Son güncelleme: 12 Ekim 2026. Yeniden üretmek için `python scripts/compose-play-assets.py` çalıştır.

## Klasörler

| Klasör | İçerik |
|---|---|
| `original/<dil>/` | Gerçek uygulamadan alınmış, dokunulmamış emülatör çekimleri (1080x2400 PNG). Play'e **doğrudan yüklenemez**: oranları 2,22:1, sınır ise 2:1. |
| `final/<dil>/` | Play Console'a yüklenecek görseller: 1080x1920 (9:16), 24 bit PNG, alfa kanalı yok. |
| `preview/contact-<dil>.png` | Sıralamayı topluca görmek için önizleme. **Yüklenmez.** |

## Çekim ortamı

- **Cihaz:** Android Emulator, AVD `Medium_Phone_API_36.1` (Android 16), 1080x2400, 420 dpi.
- **Uygulama:** Erek 1.2.0 (versionCode 17), güncel kaynaktan yerel `assembleRelease` ile derlendi.
- **Tema:** Önce koyu tema. 01–07 koyu temada, 08 açık temada çekildi. Vurgu rengi Çam, yazı tipi telefonun kendi yazı tipi.
- **Durum çubuğu:** SystemUI demo modunda: saat 09:41, pil dolu, Wi-Fi tam, bildirim yok.
- **Tarih:** Cihaz saati 11 Ekim 2026 Pazar 09:41'e ayarlandı (`cmd alarm set-time`) ve çekimden sonra otomatiğe geri alındı.
- **Uygulama durumu:** Her dil için `pm clear` ile temiz kurulum yapıldı, sihirbaz atlandı, dil ve tema seçildi, demo veri içe aktarıldı. Ardından uygulama kapatılıp yeniden açıldı.

## Demo veri: gerçekçi, iddiasız

Veriyi `scripts/gen-demo-data.js <çıktı> tr|en|de` üretiyor. Sabit tohumlu ve üç dilde aynı rakamları veriyor. Uygulamanın kendi **Profil › Verilerim › Verileri içe aktar** akışıyla yüklendi. Gerçek kullanıcı verisi, hesap ya da sunucu kullanılmadı.

Amaç, mükemmel değil sıradan bir kullanıcıyı göstermek:

- **Alışkanlıklar (7):** Seriler kısa: Vitamin 11, Meditasyon 4, Su 2, Koşu 1, Erken yat 1; Kitap ve Günlük'te seri yok.
  - Bugün sabah 09:41 itibarıyla 6 alışkanlıktan 2'si tamam ve su 2/8 bardakta.
  - Koşu yalnızca Pzt/Çar/Cmt planlı olduğu için Pazar günü listede yok.
- **Geçmiş:** 200 gün.
  - Bir haftalık tatil var (yalnızca vitamin ve biraz kitap kayıtlı), 4 gün hastalık var (hiç kayıt yok).
  - Ara ara boş geçen günler, yarım kalan günler (ör. 5/8 bardak, 9 dakika kitap) ve hafta sonu düşüşleri var.
- **Haftalık özet:** Oran %58; önceki hafta kötü geçmiş (%38). Hiç tam gün yok (0/7). En istikrarlı alışkanlık Vitamin (7/7), ilgi bekleyen Kitap oku (2/7).
- **Görevler:**
  - Elektrik faturası 10 Ekim'den kalma ve gecikmiş görünüyor.
  - Sunumun alt görevleri 1/4'te, market listesi 0/3'te.
  - Bugün tamamlanan tek görev var.
- **Hedefler:**
  - 150 km koş: %55, bu tempoyla 9 Ara'da biter (son tarih 20 Ara).
  - 5 kilo ver: 2/5. 12 kitap: 8/12. Tatil birikimi: %36.
  - Kurs 2/6 adımda, İngilizce 1/5'te. Gitar hedefi yeni başlamış ve boş (0/4).

Çapraz kontrol (TR, EN ve DE'de aynı):

- Bugün'deki 2/6, Alışkanlıklar ekranındaki üstü çizili iki kayıtla eşleşiyor (Meditasyon, Vitamin).
- %58 ve +20 puan hem Bugün kartında hem Haftalık özet ekranında aynı. Bu değerler `buildReview` demo veriyle çalıştırılarak da doğrulandı.
- Meditasyon: seri 4, haftada 6/7. Haftalık özetteki 6/7 ile aynı.
- 150 km hedefi listede ve istatistik ekranında aynı: 82,5 km, %55, 70 gün kaldı.

## Görseller

Hepsi 1080x1920 PNG, 135–277 KB. Her birinde üstte kısa bir başlık ve renk tonlu zemin var. Başlık bandı görüntü yüksekliğinin %20'sinden az. Cihaz çerçevesi yok. Çekimler yalnızca ölçeklendi ve köşeleri yuvarlatıldı; uygulama içeriğine dokunulmadı.

| Dosya | Ekran / özellik | Ham çekim | TR | EN | DE |
|---|---|---|---|---|---|
| 01-today-overview.png | Bugün (koyu) | 01-today | ✅ | ✅ | ⛔ hata 2 |
| 02-goal-forecast.png | Hedef istatistiği: tahmini bitiş ve tempo | 05-goal-stats | ✅ | ✅ | ✅ |
| 03-habit-streaks.png | Alışkanlıklar: haftalık işaretler, seriler | 03-habits | ✅ | ✅ | ✅ |
| 04-tasks-tags.png | Görevler: etiket, alt görev, gecikmiş görev | 02-tasks | ✅ | ✅ | ✅ |
| 05-goals-progress.png | Hedefler listesi | 04-goals | ✅ | ✅ | ✅ |
| 06-habit-stats.png | Meditasyon istatistiği: seri, oranlar, puan grafiği | 06-habit-stats | ✅ | ✅ | ⛔ hata 3 |
| 07-weekly-review.png | Haftalık özet | 07-review | ✅ | ⛔ hata 1 | ⛔ hata 1 |
| 08-light-theme.png | Bugün (açık tema) | 08-today-light | ✅ | ✅ | ⛔ hata 2 |

Toplam: TR 8, EN 7, DE 4 görsel. Play en az 2, en fazla 8 görsel kabul ediyor. Öne çıkarılma için en az 4 görsel ve en az 1080 piksel gerekiyor. Üç dil de bu koşulları sağlıyor; DE ise sınırda.

## Play gereksinimleri kontrolü

Kaynak: [Play Console Help: Add preview assets](https://support.google.com/googleplay/android-developer/answer/9866151), 12 Ekim 2026'da kontrol edildi.

- JPEG ya da alfasız 24 bit PNG ✅
- Kısa kenar en az 320 px, uzun kenar en fazla 3840 px ✅
- Uzun kenar kısa kenarın en fazla 2 katı (burada 1,78) ✅
- Cihaz türü başına en fazla 8 görsel ✅
- Öne çıkarılma için 9:16 ve en az 1080x1920 ✅
- Başlık alanı görüntünün %20'sinden az ✅. "En iyi", "#1" ya da "Hemen indir" gibi ifadeler, mağaza rozeti veya sıralama iddiası yok ✅
- Bildirim ve operatör adı yok, durum çubuğu ikonları dolu ✅

> Eski `docs/store-screenshots/<dil>/` görselleri 1242x2688 boyutunda. Oranları 2,16:1 olduğu için Play'in 2:1 sınırını aşıyorlar; ayrıca eski "iddialı" veriyle çekildiler. Kullanılmamalılar.

## Bulunan uygulama hataları

Bu ekranlar final sete alınmadı. Hatalar görsel düzenlemeyle gizlenmedi.

1. **Haftalık özet ekranında oran biçimi.** `app/review.tsx` içinde `%{review.rate}` sabit yazılmış. EN'de "58%", DE'de "58 %" olması gerekirken ikisinde de "%58" çıkıyor. Bugün kartı doğru biçimi kullanıyor.
2. **DE Bugün kartında taşma.** "Gewohnheiten" etiketi ilerleme çubuğunun üstüne taşıyor; koyu ve açık temada aynı.
3. **DE alışkanlık istatistiğinde kesilen etiket.** Puan grafiğinin Y ekseninde "100 %" sığmıyor ve "100…" diye kesiliyor.
4. **Bugün'deki haftalık özet kartı eski değer gösterebiliyor.** 11 Ekim'deki ilk çekimde, içe aktarmadan hemen sonra kart yanlış bir değer gösterdi; soğuk açılışta düzeldi. Muhtemel sebep: `app/(tabs)/index.tsx` içindeki `reviewPreview` useMemo'su alışkanlık kayıtları değişince yeniden hesaplanmıyor. Bu çekimler her dilde yeniden başlatmadan sonra alındı.

## Bilinen sınırlamalar

- Arkadaşlar özelliği (Google girişi ve sunucu gerekiyor) ve sesli görev (konuşma gerekiyor) emülatörde gerçekçi biçimde gösterilemediği için sete alınmadı.
- Tablet ekran görüntüsü hazırlanmadı.
- Play Console'a hiçbir şey yüklenmedi.
