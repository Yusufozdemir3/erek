// Tombstone temizliği. Buradaki testlerin çoğu "SİLMEMESİ GEREKENİ silmiyor mu"
// sorusunu sorar — yanlış bir temizlik, senkronun silme bilgisini kaybetmesi ve
// kaydın diğer cihazdan geri "dirilmesi" demektir.

import { getDb } from '../database';
import { purgeOldTombstones, TOMBSTONE_TTL_DAYS } from '../maintenance';
import { goalRepo } from '../repositories/goalRepo';
import { habitRepo } from '../repositories/habitRepo';
import { reminderRepo } from '../repositories/reminderRepo';
import { subtaskRepo } from '../repositories/subtaskRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

const NOW = Date.parse('2026-08-04T12:00:00.000Z');
const DAY = 86_400_000;
const OLD = new Date(NOW - (TOMBSTONE_TTL_DAYS + 10) * DAY).toISOString();
const RECENT = new Date(NOW - 5 * DAY).toISOString();

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

// Bir satırı "eskiden silinmiş + buluta gönderilmiş" hale getirir.
function markDeleted(table: string, id: string, at: string, synced = 1): void {
  getDb().runSync(`UPDATE ${table} SET deleted_at = ?, synced = ? WHERE id = ?`, [at, synced, id]);
}

function countRows(table: string): number {
  return getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;
}

describe('purgeOldTombstones — temizlediği', () => {
  it('eski + gönderilmiş hatırlatma tombstone\'unu siler', () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    const reminder = reminderRepo.create('habit', habit.id, '08:00');
    markDeleted('reminders', reminder.id, OLD);

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(1);
    expect(countRows('reminders')).toBe(0);
  });

  it('alt görev / hedef adımı / hedef girdisi tombstone\'larını da siler', () => {
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    const sub = subtaskRepo.create(task.id, 'Adım');
    markDeleted('subtasks', sub.id, OLD);

    const goal = goalRepo.create({ user_id: userId, title: 'Hedef', goal_type: 'numeric', target_value: 10 });
    goalRepo.addProgress(goal.id, 5); // bir girdi üretir
    const entryId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM goal_entries`)!.id;
    markDeleted('goal_entries', entryId, OLD);

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(2);
    expect(countRows('subtasks')).toBe(0);
    expect(countRows('goal_entries')).toBe(0);
  });

  it('çocukları temizlenen EBEVEYN aynı turda silinebilir hale gelir', () => {
    // Yapraklar önce, ebeveynler sonra işlendiği için tek çağrı yeter.
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    const sub = subtaskRepo.create(task.id, 'Adım');
    markDeleted('subtasks', sub.id, OLD);
    taskRepo.softDelete(task.id);
    markDeleted('tasks', task.id, OLD);

    purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW);

    expect(countRows('subtasks')).toBe(0);
    expect(countRows('tasks')).toBe(0);
  });
});

describe('purgeOldTombstones — DOKUNMADIĞI', () => {
  it('henüz gönderilmemiş (synced=0) silmeyi KORUR', () => {
    // Aksi halde silme bilgisi buluta hiç ulaşmaz ve kayıt diğer cihazdan geri gelir.
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    const reminder = reminderRepo.create('habit', habit.id, '08:00');
    markDeleted('reminders', reminder.id, OLD, 0);

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(0);
    expect(countRows('reminders')).toBe(1);
  });

  it('YENİ silinmiş satırı korur (diğer cihaz henüz çekmemiş olabilir)', () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    const reminder = reminderRepo.create('habit', habit.id, '08:00');
    markDeleted('reminders', reminder.id, RECENT);

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(0);
    expect(countRows('reminders')).toBe(1);
  });

  it('AKTİF (silinmemiş) satırlara hiç dokunmaz', () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    reminderRepo.create('habit', habit.id, '08:00');
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    subtaskRepo.create(task.id, 'Adım');

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(0);
    expect(countRows('reminders')).toBe(1);
    expect(countRows('subtasks')).toBe(1);
    expect(countRows('habits')).toBe(1);
    expect(countRows('tasks')).toBe(1);
  });

  it('kendisine işaret eden AKTİF çocuğu olan ebeveyni silmez (FK kırılmaz)', () => {
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    subtaskRepo.create(task.id, 'Aktif alt görev'); // silinmedi
    taskRepo.softDelete(task.id);
    markDeleted('tasks', task.id, OLD);

    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(0);
    expect(countRows('tasks')).toBe(1);
  });

  it('logu olan silinmiş alışkanlığı silmez (bilinçli sınır — habit_logs tombstone tutmaz)', () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    habitRepo.toggleLog(habit.id, '2026-07-01', true);
    habitRepo.softDelete(habit.id);
    markDeleted('habits', habit.id, OLD);
    // softDelete hatırlatmaları da işaretler; onlar temizlensin diye eskitiyoruz.
    getDb().runSync(`UPDATE reminders SET deleted_at = ?, synced = 1`, [OLD]);

    purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW);

    expect(countRows('habits')).toBe(1);
    expect(countRows('habit_logs')).toBe(1);
  });

  it('FK kısıtları AÇIKKEN çalışır (temizlik kırık referans bırakmaz)', () => {
    const goal = goalRepo.create({ user_id: userId, title: 'Hedef', goal_type: 'numeric', target_value: 10 });
    goalRepo.addProgress(goal.id, 5);
    goalRepo.softDelete(goal.id);
    markDeleted('goals', goal.id, OLD);
    getDb().runSync(`UPDATE goal_entries SET deleted_at = ?, synced = 1`, [OLD]);

    expect(() => purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).not.toThrow();
    const broken = getDb().getAllSync(`PRAGMA foreign_key_check;`);
    expect(broken).toEqual([]);
  });

  it('boş veritabanında sorunsuz çalışır', () => {
    expect(purgeOldTombstones(TOMBSTONE_TTL_DAYS, NOW)).toBe(0);
  });
});
