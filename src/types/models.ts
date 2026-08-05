// Uygulamanın çekirdek veri tipleri.
// Her tabloya karşılık gelen bir tip burada tanımlı.
// Senkron için ortak alanlar: updated_at (son yazan kazanır), deleted_at (soft delete).

export type Priority = 'low' | 'medium' | 'high';
// 'numeric': ilerleme çubuğu (current/target). 'milestone': görev/alt görev
// mantığıyla aynı — adımlara bölünebilir (goal_milestones), elle/otomatik
// tamamlanır. Her iki tipte de artık bir deadline olabilir (eskiden yalnızca
// ayrı bir 'deadline' tipi vardı — bkz. migration011).
export type GoalType = 'numeric' | 'milestone';
// Alışkanlık takip tipi. 'binary' = yaptım/yapmadım; 'numeric' = miktar hedefi;
// 'timer' = geri sayım (target_amount hedef saniye, amount biriken saniye).
export type HabitKind = 'binary' | 'numeric' | 'timer';

// Tekrar kuralı. Hem görevler hem alışkanlıklar kullanır (JSON TEXT kolonu —
// yeni alanlar migration gerektirmez). Türler:
//   daily    → her gün
//   weekly   → weekdays doluysa haftanın belirli günleri;
//              weekdays boş + timesPerWeek>0 ise ESNEK KOTA ("haftada X kez",
//              hangi gün olduğu serbest — bkz. helpers.isQuotaSchedule)
//   monthly  → ayın belirli günü
//   interval → her X günde bir (anchor referans günü, o gün planlıdır)
//   yearly   → her yıl belirli tarihler
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'interval' | 'yearly';
  // weekly için: [1,3,5] = Pzt, Çar, Cum (0=Pazar ... 6=Cumartesi)
  weekdays?: number[];
  // weekly ESNEK KOTA için: haftada kaç kez (weekdays boşken anlamlı)
  timesPerWeek?: number;
  // monthly için: ayın günü (1-31)
  monthDay?: number;
  // interval için: kaç günde bir (>=1)
  every?: number;
  // interval için: referans günü "YYYY-MM-DD" — bu gün ve her `every` gün sonrası planlı
  anchor?: string;
  // yearly için: ["MM-DD", ...] (yıl bileşeni yok)
  dates?: string[];
}

// Tüm kayıtların paylaştığı senkron alanları.
export interface SyncFields {
  id: string;            // UUID, cihaz üretir
  updated_at: string;    // ISO 8601, çakışma çözümü için
  deleted_at: string | null; // null değilse silinmiş sayılır
  synced: 0 | 1;         // 1 = buluta gönderildi, 0 = bekliyor
}

export interface User extends SyncFields {
  email: string | null;
  is_anonymous: 0 | 1;
}

export interface Task extends SyncFields {
  user_id: string;
  title: string;
  due_date: string | null;       // ISO 8601; saat gömülüyse başlangıç/vade saati
  end_time: string | null;       // "HH:MM"; aynı günün bitiş saati, null = yok
  priority: Priority;
  recurrence: Recurrence | null; // null = tek seferlik
  remind_at: string | null;      // "09:00"; son tarih GÜNÜNDE bu saatte hatırlat (null = hatırlatma yok). due_date saatinden bağımsız.
  completed_at: string | null;   // null = tamamlanmadı
}

export interface Goal extends SyncFields {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value: number | null;   // numeric için: hedef (örn. 100 km)
  current_value: number;         // numeric için: mevcut (örn. 40 km)
  unit: string | null;           // "km", "kitap", "saat"
  deadline: string | null;       // "YYYY-MM-DD"; artık her iki tipte de kullanılabilir
  // Yalnızca 'milestone' hedeflerde elle/otomatik (tüm adımlar tamamlanınca)
  // yazılır. 'numeric' hedefte hep NULL — tamamlanma current_value>=target_value'dan
  // türetilir (bkz. goalRepo.isCompleted).
  completed_at: string | null;
  remind_at: string | null;      // "08:30" gibi, günlük giriş hatırlatma saati
  start_date: string | null;     // "YYYY-MM-DD"; tempo/projeksiyon hesaplarının sıfır günü (bkz. goalProjection.ts). Eski hedeflerde NULL olabilir.
  // current_value'nun girdilerle TEMSİL EDİLMEYEN parçası (bkz. migration019):
  // bu değişiklikten önce birikmiş değer + kullanıcının "Mevcut değer"i elle
  // değiştirmesi. Okuyucular bunu kullanmaz — current_value zaten
  // baseline + girdiler toplamı olarak tutulur (goalRepo.recomputeFromEntries).
  value_baseline: number;
}

// Bir hedefin adımı/parçası. İki kullanım biçimi var:
//   'milestone' hedefte → basit checklist maddesi (subtask deseni): elle
//     işaretlenir, amount hep NULL.
//   'numeric' hedefte + amount doluysa → ARA EŞİK: adımın yüzdesi hedefin
//     current_value'sundan KÜMÜLATİF türetilir (adımlar position sırasıyla
//     dolar), elle İŞARETLENMEZ; completed kolonu bu kipte kullanılmaz.
//     (bkz. goalMilestoneRepo.milestoneViews)
// due_date her iki kipte de opsiyonel adım son tarihidir.
export interface GoalMilestone extends SyncFields {
  goal_id: string;
  title: string;
  completed: 0 | 1;
  position: number; // oluşturma sırası; liste bu sırayla gösterilir
  amount: number | null;   // yalnız numeric hedefte anlamlı ara-eşik miktarı
  due_date: string | null; // "YYYY-MM-DD" opsiyonel adım son tarihi
}

// Hedefin 'Genel' sekmesinde serbest miktar girişiyle ("Ekle") eklenen bir kayıt.
// Yalnızca bir GÜNLÜKTÜR (audit log) — goal.current_value zaten tek doğru kaynak,
// bu tablodan TÜRETİLMEZ; yalnızca "ne zaman ne kadar eklendi" geçmişini tutar,
// kullanıcı Genel sekmesinde görebilsin diye. updated_at hem oluşturma hem (varsa)
// silinme zaman damgasıdır — SyncFields'daki diğer tüm tablolarla aynı desen.
export interface GoalEntry extends SyncFields {
  goal_id: string;
  amount: number; // pozitif ya da negatif (düzeltme) olabilir
}

// Bağlı hedefe katkı biçimi: 'per_completion' (tamamlanan gün başına +1, binary'de
// tek anlamlı seçenek) | 'amount' (o gün yapılan miktar × goal_factor hedefe eklenir,
// yalnız numeric/timer'da anlamlı). NULL = 'per_completion' (geriye dönük varsayılan).
export type GoalContribution = 'per_completion' | 'amount';

export interface Habit extends SyncFields {
  user_id: string;
  goal_id: string | null;        // ileride bir hedefe bağlanabilir
  title: string;
  kind: HabitKind;               // 'binary' | 'numeric' | 'timer'
  remind_at: string | null;      // "08:30" gibi, günlük hatırlatma saati
  icon: string | null;           // emoji (görsel kimlik), null = yok
  color: string | null;          // hex renk "#rrggbb", null = varsayılan
  schedule: Recurrence | null;   // hangi günler geçerli; null = her gün
  target_amount: number | null;  // numeric: günlük miktar (ör. 8) · timer: hedef saniye · binary: null
  unit: string | null;           // "bardak", "sayfa"; numeric hedefte anlamlı (timer/binary: null)
  start_date: string | null;     // "YYYY-MM-DD"; null = baştan beri
  end_date: string | null;       // "YYYY-MM-DD"; null = süresiz
  goal_contribution: GoalContribution | null; // bkz. GoalContribution; NULL = per_completion
  goal_factor: number;           // yalnız 'amount' modunda çarpan; varsayılan 1
}

// Bir görevin alt görevi (basit checklist maddesi).
// Bilinçli olarak yalın: kendi tarihi/önceliği yok, yalnızca başlık + durum.
export interface Subtask extends SyncFields {
  task_id: string;
  title: string;
  completed: 0 | 1;
  position: number; // oluşturma sırası; liste bu sırayla gösterilir
}

// Çoklu hatırlatma. Alışkanlık/görev/hedefin remind_at (tekil "HH:MM") alanı
// artık kullanılmıyor — her varlık bu tablodan SIFIR ya da DAHA FAZLA hatırlatma
// saatine sahip olabilir (bkz. reminderRepo, notifications.scheduleHabitReminders
// vb.). Eski remind_at kolonları migration016'da bu tabloya geriye dönük
// aktarılır ama DB'de dokunulmadan kalır (veri kaybı yok, artık okunmuyor).
export type ReminderEntityType = 'habit' | 'task' | 'goal';

export interface Reminder extends SyncFields {
  entity_type: ReminderEntityType;
  entity_id: string;
  time: string; // "HH:MM"
}

// Her gün bir alışkanlığı işaretlediğinde bir kayıt oluşur.
// Streak ve istatistikler bu kayıtlardan hesaplanır.
export interface HabitLog {
  id: string;
  habit_id: string;
  log_date: string;     // "2026-06-28" formatında, sadece tarih
  completed: 0 | 1;     // nicel alışkanlıkta: amount >= target olunca 1
  amount: number;       // o gün yapılan miktar (ikili alışkanlıkta kullanılmaz, 0)
  updated_at: string;
}
