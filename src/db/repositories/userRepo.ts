// Kullanıcı (User) repository.
// "Girişsiz başla" akışının temeli: uygulama ilk açıldığında anonim bir
// yerel kullanıcı oluşturulur. Kullanıcı sonradan hesap açarsa bu kayıt
// e-posta ile ilişkilendirilir (is_anonymous -> 0).

import { getDb } from '../database';
import { newId, nowIso } from '../../lib/helpers';
import type { User } from '../../types/models';

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    is_anonymous: row.is_anonymous,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
  };
}

export const userRepo = {
  // Cihazdaki mevcut kullanıcıyı döner; yoksa anonim olarak oluşturur.
  // Uygulama açılışında çağrılır - her zaman bir kullanıcı garantiler.
  getOrCreateLocal(): User {
    const db = getDb();
    const existing = db.getFirstSync<any>(
      `SELECT * FROM users WHERE deleted_at IS NULL LIMIT 1`
    );
    if (existing) return rowToUser(existing);

    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO users (id, email, is_anonymous, updated_at, deleted_at, synced)
       VALUES (?, NULL, 1, ?, NULL, 0)`,
      [id, now]
    );
    // Yeni ekleneni tekrar sorgulamaya gerek yok — alanlar zaten elimizde.
    return { id, email: null, is_anonymous: 1, updated_at: now, deleted_at: null, synced: 0 };
  },

  // Anonim kullanıcıyı kayıtlı hesaba yükseltir (Ayarlar'dan hesap bağlanınca).
  upgradeToAccount(id: string, email: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = ?, is_anonymous = 0, updated_at = ?, synced = 0 WHERE id = ?`,
      [email, nowIso(), id]
    );
  },

  // Hesaptan çıkışta yerel kullanıcıyı yeniden anonim yapar (veri cihazda kalır).
  downgradeToLocal(id: string): void {
    const db = getDb();
    db.runSync(
      `UPDATE users SET email = NULL, is_anonymous = 1, updated_at = ?, synced = 0 WHERE id = ?`,
      [nowIso(), id]
    );
  },
};
