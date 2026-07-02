// taskRepo testleri: CRUD ve sıralama (önce tarih/saat, sonra öncelik).

import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
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
  });

  it('softDelete kaydı gizler', () => {
    const task = createTask();
    taskRepo.softDelete(task.id);
    expect(taskRepo.getById(task.id)).toBeNull();
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
});
