// "Verileri içe aktar": dışa aktarılan dosya başka bir telefonda aynen geri gelir;
// bozuk / kötü niyetli dosya hiçbir şeyi bozmaz.

import { getDb } from '../database';
import { buildExport } from '../exportData';
import { importData, MAX_IMPORT_BYTES, parseExport, summarize } from '../importData';
import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalMilestoneRepo } from '../repositories/goalMilestoneRepo';
import { goalRepo } from '../repositories/goalRepo';
import { habitRepo } from '../repositories/habitRepo';
import { reminderRepo } from '../repositories/reminderRepo';
import { subtaskRepo } from '../repositories/subtaskRepo';
import { tagRepo } from '../repositories/tagRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let uid: string;
beforeEach(async () => {
  await resetTestDb();
  uid = userRepo.getOrCreateLocal().id;
});

// A phone with some of everything; returns the export text.
function seedAndExport(): string {
  const water = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 8, unit: 'bardak' });
  habitRepo.incrementAmount(water.id, '2026-10-01', 5, 8);
  const read = habitRepo.create({
    user_id: uid,
    title: 'Kitap',
    schedule: { freq: 'weekly', weekdays: [1, 3] } as never,
  });
  habitRepo.toggleLog(read.id, '2026-10-02', true);
  const tag = tagRepo.create(uid, 'Ev', '#10b981')!;
  const t = taskRepo.create({ user_id: uid, title: 'Alışveriş', due_date: '2026-10-05', recurrence: { freq: 'daily' } as never, icon: 'cart', tag_ids: [tag.id] });
  subtaskRepo.create(t.id, 'Süt');
  const g = goalRepo.create({ user_id: uid, title: 'Koş', goal_type: 'numeric', target_value: 100, unit: 'km' });
  goalMilestoneRepo.create(g.id, '50 km', { amount: 50 });
  goalEntryRepo.create(g.id, 5);
  reminderRepo.replaceAll('task', t.id, ['09:00', '18:30']);
  return JSON.stringify(buildExport(uid));
}

// Wipes the phone's data (a "new phone"), keeping a user row.
async function newPhone() {
  await resetTestDb();
  return userRepo.getOrCreateLocal().id;
}

const parsed = (text: string) => {
  const r = parseExport(text);
  if (!r.ok) throw new Error('parse failed: ' + r.reason);
  return r.doc;
};

describe('gidiş-dönüş', () => {
  it('yeni telefonda her şey geri gelir ve sahibi yeni kullanıcıdır', async () => {
    const text = seedAndExport();
    const before = buildExport(uid);
    const newUid = await newPhone();

    const report = importData(newUid, parsed(text));

    expect(report.skipped).toBe(0);
    expect(report.existing).toBe(0);
    expect(Object.values(report.imported).reduce((a, b) => a + b, 0)).toBe(
      Object.values(before.counts).reduce((a, b) => a + b, 0)
    );
    const after = buildExport(newUid);
    expect(after.counts).toEqual(before.counts);
    // Aynı içerik (updated_at dahil): alanlar bire bir.
    for (const k of ['habits', 'habitLogs', 'tasks', 'subtasks', 'tags', 'goals', 'goalMilestones', 'goalEntries', 'reminders'] as const) {
      expect(after[k]).toEqual(before[k].map((r) => ({ ...r, ...('user_id' in r ? { user_id: newUid } : {}) })));
    }
    // Eşitleme için işaretlenir.
    expect(getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM habits WHERE synced = 0')!.n).toBe(2);
  });

  it('aynı dosyayı iki kez aktarmak hiçbir şeyi değiştirmez', async () => {
    const text = seedAndExport();
    const newUid = await newPhone();
    importData(newUid, parsed(text));
    const once = buildExport(newUid);

    const second = importData(newUid, parsed(text));

    expect(Object.values(second.imported).every((n) => n === 0)).toBe(true);
    expect(second.existing).toBe(once.counts.habits + once.counts.habitLogs + once.counts.tasks + once.counts.subtasks + once.counts.tags + once.counts.goals + once.counts.goalMilestones + once.counts.goalEntries + once.counts.reminders);
    expect(buildExport(newUid).counts).toEqual(once.counts);
  });

  it('telefonda zaten olan kayıt ezilmez; sonradan silinen geri gelmez', async () => {
    const text = seedAndExport();
    const habitId = parsed(text).habits[0].id as string;
    habitRepo.update(habitId, { title: 'Sonradan değiştirdim' });
    const other = parsed(text).habits[1].id as string;
    habitRepo.softDelete(other);

    const report = importData(uid, parsed(text));

    expect(report.existing).toBeGreaterThan(0);
    expect(habitRepo.getById(habitId)?.title).toBe('Sonradan değiştirdim');
    expect(habitRepo.getById(other)).toBeNull();
  });
});

describe('hedefe bağlı alışkanlık', () => {
  it('bağlantı korunur (hedefler alışkanlıklardan önce yazılır)', async () => {
    const g = goalRepo.create({ user_id: uid, title: 'Koş', goal_type: 'numeric', target_value: 10 });
    const h = habitRepo.create({ user_id: uid, title: 'Koşu', goal_id: g.id });
    const text = JSON.stringify(buildExport(uid));
    const newUid = await newPhone();

    const report = importData(newUid, parsed(text));

    expect(report.skipped).toBe(0);
    expect(habitRepo.getById(h.id)?.goal_id).toBe(g.id);
  });

  it('hedefi olmayan (silinmiş) bir hedefe bağlıysa alışkanlık bağsız gelir, atlanmaz', () => {
    const doc = parsed(JSON.stringify({
      app: 'Erek', formatVersion: 1,
      habits: [{ id: 'habit-0000001', title: 'Yetim', goal_id: 'goal-yok-0001', updated_at: '2026-10-01T00:00:00.000Z' }],
    }));
    const report = importData(uid, doc);
    expect(report.imported.habits).toBe(1);
    expect(habitRepo.getById('habit-0000001')?.goal_id).toBeNull();
  });
});

describe('dosya doğrulama', () => {
  it('JSON olmayan, Erek olmayan, daha yeni sürüm, boş ve aşırı büyük dosyalar reddedilir', () => {
    expect(parseExport('{bozuk')).toEqual({ ok: false, reason: 'notJson' });
    expect(parseExport('[]')).toEqual({ ok: false, reason: 'notErek' });
    expect(parseExport('{"app":"Baska"}')).toEqual({ ok: false, reason: 'notErek' });
    expect(parseExport('{"app":"Erek","formatVersion":999}')).toEqual({ ok: false, reason: 'newerVersion' });
    expect(parseExport('{"app":"Erek","formatVersion":1}')).toEqual({ ok: false, reason: 'empty' });
    expect(parseExport('x'.repeat(MAX_IMPORT_BYTES + 1))).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('eksik listeler boş sayılır; özet kind başına sayar', () => {
    const doc = parsed(JSON.stringify({ app: 'Erek', formatVersion: 1, habits: [{ id: 'h-0000001', title: 'a' }] }));
    expect(summarize(doc)).toMatchObject({ habits: 1, tasks: 0, goals: 0 });
  });
});

describe('kötü niyetli ya da bozuk satırlar', () => {
  const doc = (over: Record<string, unknown>) =>
    parsed(JSON.stringify({ app: 'Erek', formatVersion: 1, ...over }));
  const habit = (over: Record<string, unknown> = {}) => ({
    id: 'habit-0000001', title: 'İyi', kind: 'binary', updated_at: '2026-10-01T00:00:00.000Z', ...over,
  });

  it('yanlış türdeki, kimliksiz ya da kimliği geçersiz satır atlanır; diğerleri girer', () => {
    const report = importData(uid, doc({
      habits: [
        habit(),
        habit({ id: 'habit-0000002', title: 42 }), // başlık sayı
        habit({ id: 'habit-0000003', target_amount: 'çok' }), // sayı yerine metin
        habit({ id: "x'; DROP TABLE habits;--" }), // geçersiz kimlik
        { title: 'kimliksiz' },
        'sadece metin',
        null,
        habit({ id: 'habit-0000004', schedule: '{bozuk json' }),
      ],
    }));
    expect(report.imported.habits).toBe(1);
    expect(report.skipped).toBe(7);
    expect(habitRepo.listByUser(uid).map((h) => h.title)).toEqual(['İyi']);
  });

  it('zorunlu alanı eksik satır atlanır (başlıksız alışkanlık)', () => {
    const report = importData(uid, doc({ habits: [{ id: 'habit-0000009', updated_at: 'x' }] }));
    expect(report.imported.habits).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it('bilinmeyen ve ayrılmış alanlar yok sayılır: sahip, eşitleme, silinme, arkadaş kimliği dosyadan gelmez', () => {
    importData(uid, doc({
      tasks: [{
        id: 'task-00000001', title: 'Görev', priority: 'low', updated_at: '2026-10-01T00:00:00.000Z',
        user_id: 'baskasi', synced: 1, deleted_at: '2026-01-01', shared_owner_uid: 'f', shared_with_id: 'f',
        evil: 'x', 'title) VALUES (1); --': 'x',
      }],
    }));
    const row = getDb().getFirstSync<Record<string, unknown>>("SELECT * FROM tasks WHERE id = 'task-00000001'")!;
    expect(row).toMatchObject({ user_id: uid, synced: 0, deleted_at: null, shared_owner_uid: null, shared_with_id: null });
    expect(row).not.toHaveProperty('evil');
  });

  it('ebeveyni olmayan çocuk satır atlanır, ebeveyniyle gelen girer', () => {
    const report = importData(uid, doc({
      habits: [habit()],
      habitLogs: [
        { id: 'log-00000001', habit_id: 'habit-0000001', log_date: '2026-10-01', completed: 1, updated_at: 'x' },
        { id: 'log-00000002', habit_id: 'yok-yok-yok', log_date: '2026-10-01', completed: 1, updated_at: 'x' },
      ],
    }));
    expect(report.imported.habitLogs).toBe(1);
    expect(report.skipped).toBe(1);
  });

  it('aynı gün için ikinci günlük (UNIQUE) sessizce "zaten var" sayılır', () => {
    const report = importData(uid, doc({
      habits: [habit()],
      habitLogs: [
        { id: 'log-00000001', habit_id: 'habit-0000001', log_date: '2026-10-01', completed: 1, updated_at: 'x' },
        { id: 'log-00000002', habit_id: 'habit-0000001', log_date: '2026-10-01', completed: 0, updated_at: 'x' },
      ],
    }));
    expect(report.imported.habitLogs).toBe(1);
    expect(report.existing).toBe(1);
  });

  it('tamsayı sütununa metin ya da ondalık gelirse satır atlanır', () => {
    const report = importData(uid, doc({
      habits: [habit()],
      habitLogs: [
        { id: 'log-00000001', habit_id: 'habit-0000001', log_date: '2026-10-01', completed: 'evet', updated_at: 'x' },
        { id: 'log-00000002', habit_id: 'habit-0000001', log_date: '2026-10-02', completed: 0.5, updated_at: 'x' },
        { id: 'log-00000003', habit_id: 'habit-0000001', log_date: '2026-10-03', completed: 1, updated_at: 'x' },
      ],
    }));
    expect(report.imported.habitLogs).toBe(1);
    expect(report.skipped).toBe(2);
  });

  it('aşırı uzun kural (JSON) atlanır', () => {
    const long = JSON.stringify({ freq: 'weekly', weekdays: [1], pad: 'x'.repeat(5000) });
    const report = importData(uid, doc({ habits: [habit({ schedule: long })] }));
    expect(report.imported.habits).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it('aşırı uzun metin atlanır', () => {
    const report = importData(uid, doc({ habits: [habit({ title: 'a'.repeat(5000) })] }));
    expect(report.imported.habits).toBe(0);
    expect(report.skipped).toBe(1);
  });

  it('beklenmeyen hata tüm içe aktarmayı geri alır', () => {
    const d = doc({ habits: [habit()] });
    const db = getDb();
    const real = db.runSync.bind(db);
    let calls = 0;
    (db as unknown as { runSync: unknown }).runSync = (...a: Parameters<typeof real>) => {
      if (++calls === 1) throw new Error('disk full');
      return real(...a);
    };
    try {
      // İlk insert hata verir ama satır-düzeyinde yakalanır → atlanır, kalan işlem sürer.
      const r = importData(uid, d);
      expect(r.skipped).toBe(1);
    } finally {
      (db as unknown as { runSync: unknown }).runSync = real;
    }
    // Hem de iç BEGIN/COMMIT hatası: COMMIT başarısızsa geri alınır.
    const execReal = db.execSync.bind(db);
    (db as unknown as { execSync: unknown }).execSync = (sql: string) => {
      if (sql.startsWith('COMMIT')) throw new Error('commit failed');
      return execReal(sql);
    };
    try {
      expect(() => importData(uid, doc({ habits: [habit({ id: 'habit-0000007' })] }))).toThrow('commit failed');
    } finally {
      (db as unknown as { execSync: unknown }).execSync = execReal;
    }
    expect(habitRepo.getById('habit-0000007')).toBeNull();
  });
});

describe('etiketler', () => {
  it('etiketler görevlerden önce gelir; görevin ikon ve etiketleri korunur', async () => {
    const text = seedAndExport();
    const newUid = await newPhone();
    importData(newUid, parsed(text));
    const [tag] = tagRepo.listByUser(newUid);
    expect(tag).toMatchObject({ name: 'Ev', color: '#10b981', user_id: newUid, synced: 0 });
    expect(taskRepo.listByUser(newUid)[0]).toMatchObject({ icon: 'cart', tag_ids: [tag.id] });
  });

  it('JSON olmayan tag_ids taşıyan görev atlanır, gerisi gelir', async () => {
    const doc = JSON.parse(seedAndExport());
    doc.tasks[0].tag_ids = 'bozuk[';
    const newUid = await newPhone();
    const report = importData(newUid, parsed(JSON.stringify(doc)));
    expect(report.skipped).toBeGreaterThan(0);
    expect(taskRepo.listByUser(newUid)).toHaveLength(0);
    expect(tagRepo.listByUser(newUid)).toHaveLength(1);
  });

  it('etiketsiz eski dışa aktarma dosyası sorunsuz içe aktarılır', async () => {
    const doc = JSON.parse(seedAndExport());
    delete doc.tags;
    for (const t of doc.tasks) {
      delete t.icon;
      delete t.tag_ids;
    }
    const newUid = await newPhone();
    const report = importData(newUid, parsed(JSON.stringify(doc)));
    expect(report.skipped).toBe(0);
    expect(taskRepo.listByUser(newUid)[0]).toMatchObject({ icon: null, tag_ids: [] });
  });
});
