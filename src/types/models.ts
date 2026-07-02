// Uygulamanın çekirdek veri tipleri.
// Her tabloya karşılık gelen bir tip burada tanımlı.
// Senkron için ortak alanlar: updated_at (son yazan kazanır), deleted_at (soft delete).

export type Priority = 'low' | 'medium' | 'high';
export type GoalType = 'numeric' | 'deadline';

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
  due_date: string | null;       // ISO 8601
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
  deadline: string | null;       // deadline tipi için bitiş tarihi
}

export interface Habit extends SyncFields {
  user_id: string;
  goal_id: string | null;        // ileride bir hedefe bağlanabilir
  title: string;
  remind_at: string | null;      // "08:30" gibi, günlük hatırlatma saati
  icon: string | null;           // emoji (görsel kimlik), null = yok
  color: string | null;          // hex renk "#rrggbb", null = varsayılan
  schedule: Recurrence | null;   // hangi günler geçerli; null = her gün
  target_amount: number | null;  // günlük miktar hedefi (ör. 8); null = ikili (yaptım/yapmadım)
  unit: string | null;           // "bardak", "sayfa"; target_amount ile anlamlı
  start_date: string | null;     // "YYYY-MM-DD"; null = baştan beri
  end_date: string | null;       // "YYYY-MM-DD"; null = süresiz
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
