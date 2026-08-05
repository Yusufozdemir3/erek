// Görev (Task) repository.
// UI asla SQL görmez - sadece bu fonksiyonları çağırır.
// Her yazma işlemi updated_at'i tazeler ve synced=0 yapar (senkron bekliyor).

import { getDb } from '../database';
import { reminderRepo } from './reminderRepo';
import { subtaskRepo } from './subtaskRepo';
import { newId, nextTaskOccurrence, nowIso, parseJson, toJson, todayDate } from '../../lib/helpers';
import type { Task, Priority, Recurrence } from '../../types/models';

// Öncelik sıralama anahtarı: yüksek->düşük.
const PRIORITY_RANK_SQL = `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

// Saati olan görevler (due_date "YYYY-MM-DDTHH:MM:SS", length>10) tamamen
// önce; kendi aralarında SAATE göre (kronolojik) sıralanır. Saatsiz/tüm-gün
// görevler ("YYYY-MM-DD") tamamen sonra; kendi aralarında yalnızca ÖNCELİĞE
// göre sıralanır (tarihleri farklı olsa bile). CASE ifadesi saatsiz satırlarda
// NULL üretip hepsini eşitler ki tarih aradan sızıp önceliği ezmesin.
const DUE_ORDER_SQL = `
  (length(due_date) <= 10) ASC,
  CASE WHEN length(due_date) > 10 THEN due_date END ASC,
  ${PRIORITY_RANK_SQL}
`;

// DB'den gelen ham satırı uygulama tipine çevirir (recurrence JSON parse).
function rowToTask(row: any): Task {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    due_date: row.due_date,
    end_time: row.end_time,
    priority: row.priority as Priority,
    recurrence: parseJson<Recurrence>(row.recurrence),
    remind_at: row.remind_at,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export interface CreateTaskInput {
  user_id: string;
  title: string;
  due_date?: string | null;
  end_time?: string | null;
  priority?: Priority;
  recurrence?: Recurrence | null;
  remind_at?: string | null;
}

export const taskRepo = {
  // Yeni görev oluşturur.
  create(input: CreateTaskInput): Task {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO tasks
       (id, user_id, title, due_date, end_time, priority, recurrence, remind_at, completed_at, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 0)`,
      [
        id,
        input.user_id,
        input.title,
        input.due_date ?? null,
        input.end_time ?? null,
        input.priority ?? 'medium',
        toJson(input.recurrence ?? null),
        input.remind_at ?? null,
        now,
      ]
    );
    return this.getById(id)!;
  },

  // ID ile tek görev getirir (silinmemiş).
  getById(id: string): Task | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? rowToTask(row) : null;
  },

  // Bir kullanıcının tüm aktif görevleri (son tarihe göre sıralı).
  listByUser(userId: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY (due_date IS NULL), ${DUE_ORDER_SQL}`,
      [userId]
    );
    return rows.map(rowToTask);
  },

  // "Görevler" ekranı için: TÜM tamamlanmamış görevler + yalnızca `completedSince`
  // gününden beri tamamlananlar. Tamamlananlar zaten listenin dibinde.
  //
  // NEDEN SINIR VAR: listByUser tamamlananlar dahil HER görevi döndürüyor ve ekran
  // hepsini çiziyordu. Tamamlanan görev hiç düşmediği için bir yıl kullanan birinde
  // liste binleri buluyor; hem sorgu hem render doğrusal büyüyor ve asıl işe yarayan
  // kısım (yapılacaklar) o yığının içinde kayboluyordu. Aktif görevler
  // SINIRLANMAZ — kullanıcının gerçek çalışma kümesi odur ve kendiliğinden küçüktür.
  // completedSince null verilirse sınır uygulanmaz ("tümünü göster").
  listForScreen(userId: string, completedSince: string | null): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND (completed_at IS NULL OR ?2 IS NULL OR date(completed_at, 'localtime') >= ?2)
       ORDER BY (completed_at IS NOT NULL), (due_date IS NULL), ${DUE_ORDER_SQL}`,
      [userId, completedSince]
    );
    return rows.map(rowToTask);
  },

  // Sınırın DIŞINDA kalan (daha eski tarihte tamamlanmış) görev sayısı — ekran
  // "tümünü göster" düğmesini yalnız gerçekten gizlenen bir şey varsa gösterir.
  countCompletedBefore(userId: string, since: string): number {
    const db = getDb();
    const row = db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND completed_at IS NOT NULL AND date(completed_at, 'localtime') < ?`,
      [userId, since]
    );
    return row?.n ?? 0;
  },

  // "Bugün" ekranı için: bugün veya daha önce vadesi gelen, tamamlanmamış görevler.
  listDueToday(userId: string, today: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND completed_at IS NULL
         AND due_date IS NOT NULL AND date(due_date) <= ?
       ORDER BY ${DUE_ORDER_SQL}`,
      [userId, today]
    );
    return rows.map(rowToTask);
  },

  // "Bugün" ekranının gösterdiği liste: listDueToday'den farkı, BUGÜN tamamlanan
  // görevleri de döndürür ki kutuya basınca görev kaybolmasın - işaretli/üstü
  // çizili olarak gün boyu listede kalsın, ertesi gün kendiliğinden düşsün.
  // Tamamlananlar listenin altına, tamamlanmamışlar vadeye göre üste sıralanır.
  listForToday(userId: string, today: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND due_date IS NOT NULL
         AND (
           (completed_at IS NULL AND date(due_date) <= ?)
           OR (completed_at IS NOT NULL AND date(completed_at, 'localtime') = ?)
         )
       ORDER BY (completed_at IS NOT NULL), ${DUE_ORDER_SQL}`,
      [userId, today, today]
    );
    return rows.map(rowToTask);
  },

  // Belirli bir GÜNE vadeli görevler (tamamlanmış dahil). "Bugün" ekranında
  // başka bir güne gezinildiğinde o günün görevlerini net göstermek için.
  // listForToday'den farkı: kümülatif "<=" yok, sadece tam o gün; geçmiş günde
  // devreden görevlerle karışmaz.
  listByDueDate(userId: string, date: string): Task[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM tasks
       WHERE user_id = ? AND deleted_at IS NULL
         AND due_date IS NOT NULL AND date(due_date) = ?
       ORDER BY (completed_at IS NOT NULL), ${DUE_ORDER_SQL}`,
      [userId, date]
    );
    return rows.map(rowToTask);
  },

  // Görevi tamamlandı olarak işaretle (ya da geri al).
  //
  // TEKRARLAYAN görevde "tamamla" (completed=true) farklı davranır: görev
  // tamamlandı işaretlenmek YERİNE bir sonraki tekrar tarihine ILERI SARILIR
  // (kullanıcı kararı: ayrı kopya/geçmiş tutulmaz, aynı satır ilerler). Böylece
  // görev bugünden düşer ve sonraki tekrar gününde yeniden görünür; alt görevleri
  // varsa taze bir checklist için sıfırlanır. Geri alma (completed=false) her
  // zaman normal yolla (completed_at temizlenir) işler. Kural bozuk/çözülemezse
  // (nextTaskOccurrence null) normal tamamlamaya düşülür.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    if (completed) {
      const task = this.getById(id);
      if (task && task.recurrence) {
        const today = todayDate();
        const next = nextTaskOccurrence(task.recurrence, task.due_date ?? today, today);
        if (next) {
          db.runSync(
            `UPDATE tasks SET due_date = ?, completed_at = NULL, updated_at = ?, synced = 0 WHERE id = ?`,
            [next, nowIso(), id]
          );
          subtaskRepo.reopenForTask(id);
          return;
        }
      }
    }
    db.runSync(
      `UPDATE tasks SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  // Görev alanlarını günceller.
  update(id: string, fields: Partial<CreateTaskInput>): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.due_date !== undefined) { sets.push('due_date = ?'); vals.push(fields.due_date); }
    if (fields.end_time !== undefined) { sets.push('end_time = ?'); vals.push(fields.end_time); }
    if (fields.priority !== undefined) { sets.push('priority = ?'); vals.push(fields.priority); }
    if (fields.recurrence !== undefined) { sets.push('recurrence = ?'); vals.push(toJson(fields.recurrence)); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (sets.length === 0) return;
    sets.push('updated_at = ?'); vals.push(nowIso());
    sets.push('synced = 0');
    vals.push(id);
    db.runSync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, vals);
  },

  // Soft delete - kayıt kalır, deleted_at işaretlenir (senkronda geri gelmesin diye).
  // Göreve ait hatırlatma satırları da burada temizlenir (gerekçe: habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
    reminderRepo.deleteAllForEntity('task', id);
  },
};
