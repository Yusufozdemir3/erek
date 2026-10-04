// Silmeyi geri alma: kayıt ve silinmeyle giden hatırlatmalar döner; önceden silinen hatırlatma dönmez.

import { getDb } from '../database';
import { goalRepo } from '../repositories/goalRepo';
import { habitRepo } from '../repositories/habitRepo';
import { reminderRepo } from '../repositories/reminderRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let uid: string;
beforeEach(async () => {
  await resetTestDb();
  uid = userRepo.getOrCreateLocal().id;
});

const times = (type: 'task' | 'habit' | 'goal', id: string) => reminderRepo.listByEntity(type, id).map((r) => r.time).sort();

describe('restore', () => {
  it('görev: geri gelir, hatırlatmaları döner, eşitleme için işaretlenir', () => {
    const t = taskRepo.create({ user_id: uid, title: 'Market', due_date: '2026-10-05' });
    reminderRepo.replaceAll('task', t.id, ['09:00', '18:00']);
    taskRepo.softDelete(t.id);
    expect(taskRepo.getById(t.id)).toBeNull();
    getDb().runSync('UPDATE tasks SET synced = 1 WHERE id = ?', [t.id]);

    expect(taskRepo.restore(t.id)).toBe(true);

    expect(taskRepo.getById(t.id)?.title).toBe('Market');
    expect(times('task', t.id)).toEqual(['09:00', '18:00']);
    expect(getDb().getFirstSync<{ synced: number }>('SELECT synced FROM tasks WHERE id = ?', [t.id])!.synced).toBe(0);
  });

  it('daha önce kullanıcının kaldırdığı hatırlatma geri gelmez', () => {
    const h = habitRepo.create({ user_id: uid, title: 'Su' });
    reminderRepo.replaceAll('habit', h.id, ['08:00', '20:00']);
    reminderRepo.replaceAll('habit', h.id, ['08:00']); // 20:00 kaldırıldı
    const until = Date.now() + 5;
    while (Date.now() < until) {
      // zaman damgaları (ms) aynı olmasın
    }
    habitRepo.softDelete(h.id);

    habitRepo.restore(h.id);

    expect(times('habit', h.id)).toEqual(['08:00']);
  });

  it('alışkanlık günlükleri korunur; hedef geri gelir', () => {
    const h = habitRepo.create({ user_id: uid, title: 'Kitap' });
    habitRepo.toggleLog(h.id, '2026-10-01', true);
    habitRepo.softDelete(h.id);
    habitRepo.restore(h.id);
    expect(habitRepo.isCompletedOn(h.id, '2026-10-01')).toBe(true);

    const g = goalRepo.create({ user_id: uid, title: 'Koş', goal_type: 'numeric', target_value: 5 });
    reminderRepo.replaceAll('goal', g.id, ['07:00']);
    goalRepo.softDelete(g.id);
    expect(goalRepo.restore(g.id)).toBe(true);
    expect(goalRepo.getById(g.id)?.title).toBe('Koş');
    expect(times('goal', g.id)).toEqual(['07:00']);
  });

  it('silinmemiş ya da olmayan kayıt için false, hiçbir şey değişmez', () => {
    const t = taskRepo.create({ user_id: uid, title: 'Açık' });
    expect(taskRepo.restore(t.id)).toBe(false);
    expect(taskRepo.restore('yok-yok-yok')).toBe(false);
    expect(habitRepo.restore('yok-yok-yok')).toBe(false);
    expect(goalRepo.restore('yok-yok-yok')).toBe(false);
  });

  it('başkasının benimle paylaştığı görev geri getirilemez', () => {
    const t = taskRepo.create({ user_id: uid, title: 'Arkadaşın' });
    taskRepo.softDelete(t.id);
    getDb().runSync("UPDATE tasks SET shared_owner_uid = 'friend' WHERE id = ?", [t.id]);
    expect(taskRepo.restore(t.id)).toBe(false);
  });
});
