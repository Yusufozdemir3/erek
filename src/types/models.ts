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

// Tekrar kuralı. Hem görevler hem (ileride) alışkanlıklar kullanır.
// Basit tutuldu: günlük / haftanın belli günleri / aylık belli gün.
export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  // weekly için: [1,3,5] = Pzt, Çar, Cum (0=Pazar ... 6=Cumartesi)
  weekdays?: number[];
  // monthly için: ayın günü (1-31)
  monthDay?: number;
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
}

// Bir hedefin adımı/parçası (goal_type='milestone' için basit checklist maddesi).
// Subtask ile birebir aynı desen: kendi tarihi/önceliği yok, yalnızca başlık + durum.
export interface GoalMilestone extends SyncFields {
  goal_id: string;
  title: string;
  completed: 0 | 1;
  position: number; // oluşturma sırası; liste bu sırayla gösterilir
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
