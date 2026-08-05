// Alt görev (Subtask) repository — basit checklist.
// UI asla SQL görmez - sadece bu fonksiyonları çağırır.
// Her yazma işlemi updated_at'i tazeler ve synced=0 yapar (senkron bekliyor).

import { getDb } from '../database';
import { chunk, newId, nowIso } from '../../lib/helpers';
import type { Subtask } from '../../types/models';

function rowToSubtask(row: any): Subtask {
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    completed: row.completed,
    position: row.position,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const subtaskRepo = {
  // Yeni alt görev; listenin sonuna eklenir (position = mevcut en büyük + 1).
  create(taskId: string, title: string): Subtask {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const row = db.getFirstSync<{ maxPos: number | null }>(
      `SELECT MAX(position) AS maxPos FROM subtasks WHERE task_id = ?`,
      [taskId]
    );
    const position = (row?.maxPos ?? -1) + 1;
    db.runSync(
      `INSERT INTO subtasks (id, task_id, title, completed, position, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, 0, ?, ?, NULL, 0)`,
      [id, taskId, title, position, now]
    );
    return {
      id,
      task_id: taskId,
      title,
      completed: 0,
      position,
      updated_at: now,
      deleted_at: null,
      synced: 0,
    };
  },

  // Bir görevin aktif alt görevleri, eklenme sırasıyla.
  listByTask(taskId: string): Subtask[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM subtasks WHERE task_id = ? AND deleted_at IS NULL ORDER BY position ASC`,
      [taskId]
    );
    return rows.map(rowToSubtask);
  },

  // Görev kartlarındaki "2/3" rozeti için: tamamlanan / toplam.
  countForTask(taskId: string): { done: number; total: number } {
    const db = getDb();
    const row = db.getFirstSync<{ done: number; total: number }>(
      `SELECT COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
       FROM subtasks WHERE task_id = ? AND deleted_at IS NULL`,
      [taskId]
    );
    return { done: row?.done ?? 0, total: row?.total ?? 0 };
  },

  // countForTask'in ÇOKLU sürümü: bir liste ekranı (Bugün/Görevler) her görev
  // için ayrı sorgu (N+1) yerine tek GROUP BY ile tüm rozet sayılarını alır.
  // Yalnızca en az bir (silinmemiş) alt görevi olan görevler döner — alt görevsiz
  // görevler sonuçta hiç yer almaz (çağıran "total > 0" filtresine gerek kalmaz).
  countsForTasks(taskIds: string[]): Record<string, { done: number; total: number }> {
    const db = getDb();
    const out: Record<string, { done: number; total: number }> = {};
    // Parçalı: `IN (…)` bağlı değişken sayısı liste uzunluğuna eşit (bkz. helpers.chunk).
    for (const ids of chunk(taskIds)) {
      const placeholders = ids.map(() => '?').join(',');
      const rows = db.getAllSync<{ task_id: string; done: number; total: number }>(
        `SELECT task_id, COALESCE(SUM(completed), 0) AS done, COUNT(*) AS total
         FROM subtasks WHERE task_id IN (${placeholders}) AND deleted_at IS NULL
         GROUP BY task_id`,
        ids
      );
      for (const r of rows) out[r.task_id] = { done: r.done ?? 0, total: r.total ?? 0 };
    }
    return out;
  },

  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    db.runSync(
      `UPDATE subtasks SET completed = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? 1 : 0, nowIso(), id]
    );
  },

  // Bir görevin TAMAMLANMIŞ alt görevlerini sıfırlar (yeniden aç). Tekrarlayan
  // bir görev bir sonraki tekrara ileri sarıldığında çağrılır — yeni tekrar taze
  // (tümü işaretsiz) bir checklist'le başlasın. Yalnızca completed=1 satırlara
  // dokunur; zaten işaretsizlerde gereksiz senkron churn'ü üretmez.
  reopenForTask(taskId: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE subtasks SET completed = 0, updated_at = ?, synced = 0
       WHERE task_id = ? AND deleted_at IS NULL AND completed = 1`,
      [nowIso(), taskId]
    );
  },

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(
      `UPDATE subtasks SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [now, now, id]
    );
  },
};
