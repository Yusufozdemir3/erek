// "Verilerimi dışa aktar": yalnızca kullanıcının kendi, canlı verisi; silinmişler,
// başkasının paylaştığı görevler ve eşitleme/kimlik iç alanları dışarıda kalır.

import { getDb } from '../database';
import { buildExport, EXPORT_FORMAT_VERSION } from '../exportData';
import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalMilestoneRepo } from '../repositories/goalMilestoneRepo';
import { goalRepo } from '../repositories/goalRepo';
import { habitRepo } from '../repositories/habitRepo';
import { reminderRepo } from '../repositories/reminderRepo';
import { subtaskRepo } from '../repositories/subtaskRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let uid: string;
beforeEach(async () => {
  await resetTestDb();
  uid = userRepo.getOrCreateLocal().id;
});

const keys = (rows: Record<string, unknown>[]) => new Set(rows.flatMap((r) => Object.keys(r)));

describe('buildExport', () => {
  it('boş veritabanı: geçerli belge, sıfır sayılar', () => {
    const doc = buildExport(uid, new Date('2026-10-03T10:00:00Z'));
    expect(doc).toMatchObject({ app: 'Erek', formatVersion: EXPORT_FORMAT_VERSION, exportedAt: '2026-10-03T10:00:00.000Z' });
    expect(Object.values(doc.counts).every((n) => n === 0)).toBe(true);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it('her türden veriyi alır ve sayıları doğrudur', () => {
    const h = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 8, unit: 'bardak' });
    habitRepo.incrementAmount(h.id, '2026-10-01', 3, 8);
    habitRepo.toggleLog(habitRepo.create({ user_id: uid, title: 'Kitap' }).id, '2026-10-01', true);
    const t = taskRepo.create({ user_id: uid, title: 'Alışveriş', due_date: '2026-10-05' });
    subtaskRepo.create(t.id, 'Süt');
    const g = goalRepo.create({ user_id: uid, title: 'Koş', goal_type: 'numeric', target_value: 100, unit: 'km' });
    goalMilestoneRepo.create(g.id, '50 km', { amount: 50 });
    goalEntryRepo.create(g.id, 5);
    reminderRepo.replaceAll('task', t.id, ['09:00']);

    const doc = buildExport(uid);
    expect(doc.counts).toEqual({
      habits: 2, habitLogs: 2, tasks: 1, subtasks: 1, goals: 1, goalMilestones: 1, goalEntries: 1, reminders: 1,
    });
    expect(doc.habitLogs.find((l) => l.habit_id === h.id)).toMatchObject({ amount: 3, log_date: '2026-10-01' });
    expect(doc.tasks[0]).toMatchObject({ title: 'Alışveriş', due_date: '2026-10-05' });
  });

  it('silinmiş kayıtlar ve silinmiş alışkanlığın günlükleri dışarıda', () => {
    const h = habitRepo.create({ user_id: uid, title: 'Eski' });
    habitRepo.toggleLog(h.id, '2026-10-01', true);
    habitRepo.softDelete(h.id);
    const t = taskRepo.create({ user_id: uid, title: 'Silinen' });
    taskRepo.softDelete(t.id);
    const doc = buildExport(uid);
    expect(doc.habits).toHaveLength(0);
    expect(doc.habitLogs).toHaveLength(0);
    expect(doc.tasks).toHaveLength(0);
  });

  it('başkasının benimle paylaştığı görev ve alt görevleri dışarıda kalır', () => {
    const mine = taskRepo.create({ user_id: uid, title: 'Benim' });
    const theirs = taskRepo.create({ user_id: uid, title: 'Arkadaşın' });
    subtaskRepo.create(theirs.id, 'onun alt görevi');
    getDb().runSync(`UPDATE tasks SET shared_owner_uid = 'friend-uid' WHERE id = ?`, [theirs.id]);
    const doc = buildExport(uid);
    expect(doc.tasks.map((r) => r.id)).toEqual([mine.id]);
    expect(doc.subtasks).toHaveLength(0);
  });

  it('eşitleme ve başkasının kimliği alanları hiçbir tabloda bulunmaz', () => {
    const t = taskRepo.create({ user_id: uid, title: 'Ortak', shared_with_id: 'friend-uid' });
    const g = goalRepo.create({ user_id: uid, title: 'Hedef', goal_type: 'numeric', target_value: 10 });
    goalEntryRepo.create(g.id, 1);
    getDb().runSync(`UPDATE goal_entries SET added_by = 'friend-uid'`);
    habitRepo.create({ user_id: uid, title: 'x' });
    const doc = buildExport(uid);
    for (const rows of [doc.tasks, doc.goals, doc.goalEntries, doc.habits]) {
      for (const k of ['synced', 'deleted_at', 'shared_with_id', 'shared_owner_uid', 'added_by']) {
        expect(keys(rows).has(k)).toBe(false);
      }
    }
    expect(JSON.stringify(doc)).not.toContain('friend-uid');
    expect(t.id).toBeTruthy();
  });

  it('başka kullanıcının verisi karışmaz', () => {
    getDb().runSync(`INSERT INTO users (id, email, is_anonymous, updated_at, synced) VALUES ('other', NULL, 1, 'x', 0)`);
    habitRepo.create({ user_id: 'other', title: 'Başkasının' });
    habitRepo.create({ user_id: uid, title: 'Benim' });
    expect(buildExport(uid).habits.map((h) => h.title)).toEqual(['Benim']);
  });
});
