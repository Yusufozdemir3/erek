// Migration 001: İlk şema.
// Her tabloda offline-first için kritik alanlar:
//   updated_at  -> "son yazan kazanır" çakışma çözümü
//   deleted_at  -> soft delete (silinen kayıt işaretlenir, gerçekten silinmez)
//   synced      -> 0 ise buluta gönderilmeyi bekliyor
//
// ID'ler TEXT (UUID) çünkü cihaz internetsizken kayıt üretebilmeli
// ve bu ID buluttaki kayıtlarla çakışmamalı.

export const migration001 = `
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY NOT NULL,
  email        TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  due_date     TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',
  recurrence   TEXT,                       -- JSON string ya da NULL
  completed_at TEXT,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  synced       INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  goal_type     TEXT NOT NULL,             -- 'numeric' | 'deadline'
  target_value  REAL,
  current_value REAL NOT NULL DEFAULT 0,
  unit          TEXT,
  deadline      TEXT,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  synced        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS habits (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL,
  goal_id    TEXT,                         -- ileride bir hedefe bağlanabilir
  title      TEXT NOT NULL,
  remind_at  TEXT,                         -- "08:30" gibi
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id         TEXT PRIMARY KEY NOT NULL,
  habit_id   TEXT NOT NULL,
  log_date   TEXT NOT NULL,                -- "2026-06-28"
  completed  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id),
  UNIQUE (habit_id, log_date)              -- bir gün için tek kayıt
);

-- Sık yapılan sorgular için indeksler
CREATE INDEX IF NOT EXISTS idx_tasks_user     ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_habits_user    ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_habit     ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_logs_date      ON habit_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_goals_user     ON goals(user_id);
`;

// Migration 002: habit_logs'a senkron bayrağı.
// habit_logs ilk şemada synced taşımıyordu; bulut senkronu için her log da
// "gönderilmeyi bekliyor mu" bilgisini tutmalı. Mevcut loglar synced=0 başlar
// ki ilk senkronda buluta gönderilsinler.
export const migration002 = `
ALTER TABLE habit_logs ADD COLUMN synced INTEGER NOT NULL DEFAULT 0;
`;

// Migration 003: alışkanlıklara görsel kimlik (emoji ikon + renk).
// İkisi de opsiyonel (NULL) — mevcut alışkanlıklar varsayılan görünümde kalır.
export const migration003 = `
ALTER TABLE habits ADD COLUMN icon  TEXT;
ALTER TABLE habits ADD COLUMN color TEXT;
`;

// Migration 004: alışkanlıklara sıklık/tekrar kuralı (schedule).
// JSON (Recurrence) ya da NULL. NULL = her gün (mevcut davranış, geriye uyumlu).
export const migration004 = `
ALTER TABLE habits ADD COLUMN schedule TEXT;
`;

// Migration 005: nicel takip. habits'e günlük hedef (target_amount) + birim (unit);
// habit_logs'a o gün yapılan miktar (amount). target_amount NULL = ikili alışkanlık.
export const migration005 = `
ALTER TABLE habits ADD COLUMN target_amount REAL;
ALTER TABLE habits ADD COLUMN unit TEXT;
ALTER TABLE habit_logs ADD COLUMN amount REAL NOT NULL DEFAULT 0;
`;

// Migration 006: alışkanlığa yaşam aralığı. start_date'ten önce ve end_date'ten
// sonra alışkanlık "planlı" sayılmaz (görünmez, streak'i etkilemez). İkisi de
// NULL olabilir: NULL start = baştan beri, NULL end = süresiz (mevcut davranış).
export const migration006 = `
ALTER TABLE habits ADD COLUMN start_date TEXT;
ALTER TABLE habits ADD COLUMN end_date TEXT;
`;

// Migration 007: alt görevler (basit checklist). Kendi tarihi/önceliği yok —
// yalnızca başlık + tamamlandı. position = oluşturma sırası (updated_at toggle
// ile değiştiği için sıralamada kullanılamaz). Senkron alanları diğer
// tablolarla aynı desen (updated_at LWW + soft delete + synced bayrağı).
export const migration007 = `
CREATE TABLE IF NOT EXISTS subtasks (
  id         TEXT PRIMARY KEY NOT NULL,
  task_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
`;

// Migration 008: alışkanlık tipi (kind). 'binary' (yaptım/yapmadım) |
// 'numeric' (miktar hedefi) | 'timer' (geri sayım: target_amount = hedef SANİYE,
// habit_logs.amount = o gün biriken saniye; amount >= target olunca tamamlandı).
// Mevcut alışkanlıklar geriye dönük damgalanır: target_amount>0 ise 'numeric',
// değilse 'binary' (varsayılan). Böylece eski davranış birebir korunur.
export const migration008 = `
ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'binary';
UPDATE habits SET kind = 'numeric' WHERE target_amount IS NOT NULL AND target_amount > 0;
`;

// Migration 009: göreve bitiş saati. due_date başlangıç/vade saatini gömer;
// end_time o günün bitiş saatini "HH:MM" olarak tutar (aynı gün). NULL =
// bitiş saati yok (mevcut davranış). Yalnız bir başlangıç saati varken anlamlı.
export const migration009 = `
ALTER TABLE tasks ADD COLUMN end_time TEXT;
`;

// Migration 010: bağlı hedefe katkı biçimi. goal_contribution NULL/'per_completion'
// (mevcut davranış: tamamlanan gün başına +1) | 'amount' (o gün yapılan miktar ×
// goal_factor hedefe eklenir — birim uyuşmazlığında kullanıcı çarpanı kendi girer,
// ör. 1 bardak = 0.25 litre). goal_factor varsayılan 1 (birimler zaten aynıysa
// dokunulmaz). Yalnızca numeric/timer + bir hedefe bağlı alışkanlıkta anlamlı;
// ikili alışkanlıkta "miktar" kavramı yok, hep per_completion sayılır.
export const migration010 = `
ALTER TABLE habits ADD COLUMN goal_contribution TEXT;
ALTER TABLE habits ADD COLUMN goal_factor REAL NOT NULL DEFAULT 1;
`;

// Migration 011: hedefler yeniden şekillendi. 'deadline' tipi ayrı bir tip olmaktan
// çıkar — ARTIK HER hedefin (numeric dahil) bir deadline'ı olabilir (deadline
// kolonu zaten vardı, yalnızca tek tipe özel kullanılıyordu). goal_type'ın ikinci
// değeri 'milestone' olur (görev/alt görev mantığının aynısı: parçalara/adımlara
// bölünebilen hedef). Mevcut 'deadline' tipi kayıtlar 'milestone'a çevrilir —
// deadline değerleri zaten dolu olduğundan veri kaybı yok.
// completed_at: yalnızca 'milestone' hedeflerde elle/otomatik (tüm adımlar
// tamamlanınca) işaretlenir. 'numeric' hedef tamamlanmayı current_value >=
// target_value'dan türetmeye devam eder (dokunulmadı, completed_at hep NULL kalır).
// goal_milestones: subtasks ile birebir aynı desen (başlık+tamamlandı+sıra).
export const migration011 = `
ALTER TABLE goals ADD COLUMN completed_at TEXT;
UPDATE goals SET goal_type = 'milestone' WHERE goal_type = 'deadline';
CREATE TABLE IF NOT EXISTS goal_milestones (
  id         TEXT PRIMARY KEY NOT NULL,
  goal_id    TEXT NOT NULL,
  title      TEXT NOT NULL,
  completed  INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON goal_milestones(goal_id);
`;

// Migration 012: hedef girdi geçmişi. Hedefin 'Genel' sekmesinde kullanıcı serbest
// bir miktar yazıp "Ekle"ye bastığında current_value zaten güncellenir (goalRepo.
// addProgress); bu tablo YALNIZCA "ne zaman ne kadar eklendi" günlüğünü tutar ki
// kullanıcı geçmişini görebilsin — current_value ASLA bu tablodan türetilmez (tek
// doğru kaynak goals.current_value'dur). goal_milestones ile birebir aynı desen
// (updated_at hem oluşturma hem silinme damgası, deleted_at + synced).
export const migration012 = `
CREATE TABLE IF NOT EXISTS goal_entries (
  id         TEXT PRIMARY KEY NOT NULL,
  goal_id    TEXT NOT NULL,
  amount     REAL NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  synced     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);
CREATE INDEX IF NOT EXISTS idx_goal_entries_goal ON goal_entries(goal_id);
`;

// Migration 013: hedef adımlarına miktar + son tarih, hedeflere hatırlatma saati.
// goal_milestones.amount: SAYISAL hedeflerde adım bir "ara eşik"tir — adımın
// yüzdesi hedefin current_value'sundan KÜMÜLATİF türetilir (adımlar sırayla
// dolar), elle işaretlenmez (bkz. goalMilestoneRepo.milestoneViews). 'milestone'
// tipi hedeflerde amount NULL kalır, checkbox davranışı değişmez.
// goal_milestones.due_date: her iki tipte de opsiyonel adım son tarihi.
// goals.remind_at: "HH:MM" — hedefe günlük giriş hatırlatması (habits.remind_at
// deseni; bkz. notifications.scheduleGoalReminder).
export const migration013 = `
ALTER TABLE goal_milestones ADD COLUMN amount REAL;
ALTER TABLE goal_milestones ADD COLUMN due_date TEXT;
ALTER TABLE goals ADD COLUMN remind_at TEXT;
`;

// Migration 014: görevlere AYRI hatırlatma saati (tasks.remind_at "HH:MM").
// Eskiden görev hatırlatması örtüktü: due_date'e SAAT gömülüyse o saatte bildirim
// kurulurdu, ayrı bir kontrol yoktu. Artık hatırlatma açıkça remind_at ile
// belirlenir (habits.remind_at deseni) ve son tarihin kendi saatinden BAĞIMSIZDIR
// (görev 14:00'te vadeli olup 09:00'da hatırlatabilir). due_date'in saati yalnız
// görüntü/sıralama içindir (TimeBadge, DUE_ORDER_SQL); bildirimi artık o belirlemez.
// GERİYE UYUM: saatli mevcut görevler eskiden gömülü saatte bildirim aldığı için
// remind_at o saatle doldurulur — hatırlatmaları kesilmesin.
export const migration014 = `
ALTER TABLE tasks ADD COLUMN remind_at TEXT;
UPDATE tasks SET remind_at = substr(due_date, 12, 5)
  WHERE due_date IS NOT NULL AND length(due_date) > 10;
`;

// Migration 015: hedeflere AÇIK başlangıç tarihi (goals.start_date "YYYY-MM-DD").
// Eskiden "kaç gün oldu" (daysElapsed, goalProjection.ts) İLK GİRDİNİN tarihinden
// türetiliyordu — hedefi bugün açıp bugün 3 girdi eklersen daysElapsed=0/1 çıkar,
// ama avgDaily hep last7Total/7'ye bölündüğü için (henüz yaşanmamış günler de
// paydaya girer) günlük hızın yanlışlıkla küçük görünürdü (3 girdi/gün yerine
// 3/7≈0.4). Artık start_date açık bir alan: yeni hedefler oluşturulduğunda
// bugünle doldurulur (goalRepo.create), avgDaily'nin penceresi GERÇEK yaşanan
// gün sayısıyla sınırlanır (bkz. goalProjection.ts). Mevcut hedefler NULL
// başlar — varsa en eski girdisinin tarihiyle geriye dönük doldurulur (yoksa
// NULL kalır, goalProjection zaten girdisiz hedefte hiçbir şey üretmiyor).
export const migration015 = `
ALTER TABLE goals ADD COLUMN start_date TEXT;
UPDATE goals SET start_date = (
  SELECT MIN(substr(updated_at, 1, 10)) FROM goal_entries WHERE goal_entries.goal_id = goals.id
) WHERE start_date IS NULL;
`;

// Migration 016: çoklu hatırlatma. habits/tasks/goals.remind_at (tekil "HH:MM")
// yerine bir varlığın SIFIR ya da DAHA FAZLA hatırlatma saati olabilsin diye
// ayrı bir reminders tablosu (subtasks/goal_milestones ile aynı desen; sahiplik
// entity_type+entity_id üzerinden, RLS ebeveyn tablo gibi değil kendi başına —
// bkz. supabase/schema.sql). Eski remind_at değeri olan her kayıt için TEK bir
// satır geriye dönük eklenir (veri kaybı yok); remind_at kolonları DB'de kalır
// ama artık hiçbir kod tarafından okunmaz/yazılmaz (bkz. notifications.ts).
export const migration016 = `
CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  time        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  synced      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_type, entity_id);

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'habit', id, remind_at, updated_at, NULL, 0
FROM habits WHERE remind_at IS NOT NULL;

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'task', id, remind_at, updated_at, NULL, 0
FROM tasks WHERE remind_at IS NOT NULL;

INSERT INTO reminders (id, entity_type, entity_id, time, updated_at, deleted_at, synced)
SELECT lower(hex(randomblob(16))), 'goal', id, remind_at, updated_at, NULL, 0
FROM goals WHERE remind_at IS NOT NULL;
`;

// Migration listesi - sırayla çalışır. Yeni şema değişikliği = yeni eleman.
export const migrations = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
  { version: 4, sql: migration004 },
  { version: 5, sql: migration005 },
  { version: 6, sql: migration006 },
  { version: 7, sql: migration007 },
  { version: 8, sql: migration008 },
  { version: 9, sql: migration009 },
  { version: 10, sql: migration010 },
  { version: 11, sql: migration011 },
  { version: 12, sql: migration012 },
  { version: 13, sql: migration013 },
  { version: 14, sql: migration014 },
  { version: 15, sql: migration015 },
  { version: 16, sql: migration016 },
];
