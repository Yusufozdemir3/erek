# Habit App — Veri Katmanı (Adım 1)

Görev / hedef / alışkanlık takip uygulamasının çekirdeği. Bu ilk adım **UI içermez**; offline-first veri katmanını kurar. Üstüne ekranlar bindirilecek.

## Mimari kararlar

- **Offline-first.** Her şey önce cihazdaki SQLite'a yazılır. İnternet olmadan tam çalışır.
- **UI asla SQL görmez.** Ekranlar yalnızca repository fonksiyonlarını çağırır (`taskRepo.create()` gibi). Bu, ileride veritabanını değiştirsek bile UI'ı kırmaz.
- **UUID kimlikler.** ID'leri cihaz üretir; internetsizken oluşturulan kayıtlar buluttakiyle çakışmaz.
- **Son yazan kazanır + soft delete.** Her kayıtta `updated_at` (çakışma çözümü) ve `deleted_at` (silinen kayıt işaretlenir, gerçekten silinmez) var. Bu, ileride bulut senkronunu sorunsuz açmamızı sağlar.
- **Streak saklanmaz, hesaplanır.** Seri sayısı her zaman alışkanlık loglarından türetilir — tek doğru kaynak loglar.

## Klasör yapısı

```
src/
  types/models.ts              Tüm veri tipleri
  lib/helpers.ts               UUID, tarih, JSON yardımcıları
  db/
    database.ts                Bağlantı + migration çalıştırıcı
    index.ts                   Veri katmanının tek giriş noktası
    migrations/001_initial.ts  Şema (tüm tablolar)
    repositories/
      userRepo.ts              Anonim başlangıç + hesaba yükseltme
      taskRepo.ts              Görevler (son tarih, öncelik, tekrar)
      habitRepo.ts             Alışkanlıklar + streak hesabı
      goalRepo.ts              Hedefler (sayısal + tarihli)
```

## Kurulum

```bash
npm install
npm run typecheck   # tip kontrolü
npm start           # Expo'yu başlatır (telefonda Expo Go ile aç)
```

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

## Sonraki adım

"Bugün" ekranı + görev modülü UI'ı. Veri katmanı hazır olduğu için ekranlar doğrudan repository'leri çağıracak.
