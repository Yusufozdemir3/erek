// taskRepo testleri: CRUD ve sıralama (önce tarih/saat, sonra öncelik).

import { taskRepo } from '../repositories/taskRepo';
import { subtaskRepo } from '../repositories/subtaskRepo';
import { userRepo } from '../repositories/userRepo';
import { todayDate } from '../../lib/helpers';
import { resetTestDb } from '../../test/dbTestUtils';

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function createTask(extra: Partial<Parameters<typeof taskRepo.create>[0]> = {}) {
  return taskRepo.create({ user_id: userId, title: 'Görev', ...extra });
}

describe('create / getById / softDelete', () => {
  it('varsayılanlarla oluşturur ve geri okur', () => {
    const task = createTask();
    expect(taskRepo.getById(task.id)).toEqual(task);
    expect(task.priority).toBe('medium');
    expect(task.due_date).toBeNull();
    expect(task.remind_at).toBeNull(); // varsayılan hatırlatma yok
  });

  it('remind_at oluşturmada yazılır ve güncellemede değişir/temizlenir', () => {
    const task = createTask({ due_date: '2026-07-20', remind_at: '09:00' });
    expect(taskRepo.getById(task.id)!.remind_at).toBe('09:00');
    taskRepo.update(task.id, { remind_at: '18:30' });
    expect(taskRepo.getById(task.id)!.remind_at).toBe('18:30');
    taskRepo.update(task.id, { remind_at: null });
    expect(taskRepo.getById(task.id)!.remind_at).toBeNull();
  });

  it('softDelete kaydı gizler', () => {
    const task = createTask();
    taskRepo.softDelete(task.id);
    expect(taskRepo.getById(task.id)).toBeNull();
  });

  it('bitiş saati (end_time) oluşturmada yazılır ve güncellemeyle değişir', () => {
    const task = createTask({ due_date: '2026-07-05T14:00:00', end_time: '15:30' });
    expect(task.end_time).toBe('15:30');
    expect(taskRepo.getById(task.id)!.end_time).toBe('15:30');

    taskRepo.update(task.id, { end_time: null });
    expect(taskRepo.getById(task.id)!.end_time).toBeNull();
  });

  it('varsayılan olarak bitiş saati boştur', () => {
    expect(createTask().end_time).toBeNull();
  });
});

describe('listByUser — sıralama: saatliler üstte (kendi içi saate göre), saatsizler altta (kendi içi önceliğe göre)', () => {
  it('tarihsiz görevler tarihlilerden sonra gelir', () => {
    const noDate = createTask({ title: 'Tarihsiz' });
    const dated = createTask({ title: 'Tarihli', due_date: '2026-07-05' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([dated.id, noDate.id]);
  });

  it('aynı günde saatli görev, saatsiz (tüm gün) görevden önce gelir', () => {
    const allDay = createTask({ title: 'Tüm gün', due_date: '2026-07-05' });
    const timed = createTask({ title: 'Saatli', due_date: '2026-07-05T14:30:00' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([timed.id, allDay.id]);
  });

  it('saatli görevler kendi aralarında SAATE göre sıralanır (öncelik etkisiz)', () => {
    // Saati erken ama önceliği düşük olan, saati geç ama önceliği yüksek
    // olandan önce gelmeli — öncelik yalnızca "saatli mi değil mi" kümesini
    // değil, aynı saatteki eşitlikleri ayırt eder.
    const earlyLow = createTask({ title: 'Erken düşük', due_date: '2026-07-05T09:00:00', priority: 'low' });
    const lateHigh = createTask({ title: 'Geç yüksek', due_date: '2026-07-05T18:00:00', priority: 'high' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([earlyLow.id, lateHigh.id]);
  });

  it('saatliler arasında gün de dahil kronolojik sıra önceliği ezer', () => {
    const tomorrowHigh = createTask({ due_date: '2026-07-06T06:00:00', priority: 'high' });
    const todayLow = createTask({ due_date: '2026-07-05T22:00:00', priority: 'low' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([todayLow.id, tomorrowHigh.id]);
  });

  it('saatli görevlerde aynı tarih/saatte öncelik tiebreaker olarak devreye girer', () => {
    const low = createTask({ due_date: '2026-07-05T09:00:00', priority: 'low' });
    const high = createTask({ due_date: '2026-07-05T09:00:00', priority: 'high' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([high.id, low.id]);
  });

  it('saatsiz (tüm gün) görevler kendi aralarında da yalnızca önceliğe göre sıralanır, gün önemsiz', () => {
    const tomorrowLow = createTask({ due_date: '2026-07-06', priority: 'low' });
    const todayHigh = createTask({ due_date: '2026-07-05', priority: 'high' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([todayHigh.id, tomorrowLow.id]);
  });

  it('aynı tarih/saatte öncelik yüksekten düşüğe sıralar', () => {
    const low = createTask({ title: 'Düşük', due_date: '2026-07-05', priority: 'low' });
    const high = createTask({ title: 'Yüksek', due_date: '2026-07-05', priority: 'high' });
    const medium = createTask({ title: 'Orta', due_date: '2026-07-05', priority: 'medium' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([high.id, medium.id, low.id]);
  });

  it('tarihsiz görevler arasında da öncelik sıralar', () => {
    const low = createTask({ title: 'Düşük', priority: 'low' });
    const high = createTask({ title: 'Yüksek', priority: 'high' });
    const ids = taskRepo.listByUser(userId).map((t) => t.id);
    expect(ids).toEqual([high.id, low.id]);
  });
});

describe('update', () => {
  it('due_date saatli metni de kabul eder', () => {
    const task = createTask();
    taskRepo.update(task.id, { due_date: '2026-07-05T09:00:00' });
    expect(taskRepo.getById(task.id)!.due_date).toBe('2026-07-05T09:00:00');
  });

  it('recurrence yazılır ve temizlenir (JSON round-trip)', () => {
    const task = createTask();
    taskRepo.update(task.id, { recurrence: { freq: 'weekly', weekdays: [1, 3, 5] } });
    expect(taskRepo.getById(task.id)!.recurrence).toEqual({ freq: 'weekly', weekdays: [1, 3, 5] });
    taskRepo.update(task.id, { recurrence: null });
    expect(taskRepo.getById(task.id)!.recurrence).toBeNull();
  });
});

describe('setCompleted — tekrar (recurrence)', () => {
  it('tekrarsız görev normal tamamlanır', () => {
    const task = createTask({ due_date: '2026-07-05' });
    taskRepo.setCompleted(task.id, true);
    expect(taskRepo.getById(task.id)!.completed_at).not.toBeNull();
  });

  it('günlük tekrarlayan görev tamamlanınca tamamlanmaz, sonraki güne ileri sarılır', () => {
    const today = todayDate();
    const task = createTask({ due_date: today, recurrence: { freq: 'daily' } });
    taskRepo.setCompleted(task.id, true);
    const after = taskRepo.getById(task.id)!;
    // Tamamlanmadı — ilerledi.
    expect(after.completed_at).toBeNull();
    // Yeni tarih bugünden KESİN sonra (bugünden düşer, sonraki tekrarda görünür).
    expect(after.due_date! > today).toBe(true);
  });

  it('ileri sarınca tamamlanmış alt görevler sıfırlanır (taze checklist)', () => {
    const today = todayDate();
    const task = createTask({ due_date: today, recurrence: { freq: 'daily' } });
    const sub = subtaskRepo.create(task.id, 'Adım');
    subtaskRepo.setCompleted(sub.id, true);
    taskRepo.setCompleted(task.id, true);
    expect(subtaskRepo.listByTask(task.id)[0].completed).toBe(0);
  });

  it('geri alma (completed=false) tekrarlayan görevde de completed_at temizler', () => {
    const task = createTask({ due_date: '2026-07-05', recurrence: { freq: 'daily' } });
    taskRepo.setCompleted(task.id, false);
    expect(taskRepo.getById(task.id)!.completed_at).toBeNull();
  });
});
