// Automatic archive (db/archive.ts, migration024): tasks a week after
// completion (recurring never), goals 3 days after completion, habits 3 days
// after end_date; "Restore" brings an item back as it is and keeps it out until it
// is completed / ends again. Stats-facing lists keep every row.

import { getDb } from '../database';
import { migrations } from '../migrations/001_initial';
import { goalRepo } from '../repositories/goalRepo';
import { habitRepo } from '../repositories/habitRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { shiftYmd, todayDate } from '../../lib/helpers';
import { resetTestDb } from '../../test/dbTestUtils';
import { __resetAllDatabases } from '../../test/mocks/expo-sqlite';

let userId: string;
const today = todayDate();

// Noon local time on `days` from today, as the ISO instant the app stores.
const isoDaysAgo = (days: number) => new Date(`${shiftYmd(today, -days)}T12:00:00`).toISOString();

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function set(table: string, id: string, fields: Record<string, unknown>): void {
  const cols = Object.keys(fields);
  getDb().runSync(
    `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...cols.map((c) => fields[c] as any), id]
  );
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('görevler', () => {
  function completedTask(daysAgo: number, extra: Partial<Parameters<typeof taskRepo.create>[0]> = {}) {
    const task = taskRepo.create({ user_id: userId, title: 'Görev', due_date: shiftYmd(today, -daysAgo), ...extra });
    set('tasks', task.id, { completed_at: isoDaysAgo(daysAgo) });
    return task;
  }

  it('tamamlandıktan 7 gün sonra arşive gider, 6. gün hâlâ listededir', () => {
    const six = completedTask(6);
    const seven = completedTask(7);
    const open = taskRepo.create({ user_id: userId, title: 'Açık' });

    expect(ids(taskRepo.listArchived(userId, today))).toEqual([seven.id]);
    const screen = ids(taskRepo.listForScreen(userId, null, today));
    expect(screen).toEqual(expect.arrayContaining([six.id, open.id]));
    expect(screen).not.toContain(seven.id);
  });

  it('tekrarlayan görev hiç arşivlenmez', () => {
    const rec = completedTask(30, { recurrence: { freq: 'daily' } });
    expect(taskRepo.listArchived(userId, today)).toHaveLength(0);
    expect(ids(taskRepo.listForScreen(userId, null, today))).toContain(rec.id);
  });

  it('"daha eski tamamlananlar" sayımı arşivdekileri saymaz', () => {
    completedTask(40);
    const restored = completedTask(41);
    taskRepo.unarchive(restored.id);
    expect(taskRepo.countCompletedBefore(userId, shiftYmd(today, -30), today)).toBe(1);
  });

  it('geri alınan görev tamamlanmış haliyle döner ve senkron kuyruğuna girer', () => {
    const task = completedTask(10);
    set('tasks', task.id, { synced: 1 });
    taskRepo.unarchive(task.id);

    const back = taskRepo.getById(task.id)!;
    expect(back.completed_at).not.toBeNull();
    expect(back.unarchived_at).not.toBeNull();
    expect(back.synced).toBe(0);
    expect(taskRepo.listArchived(userId, today)).toHaveLength(0);
    expect(ids(taskRepo.listForScreen(userId, null, today))).toContain(task.id);
  });

  it('geri alındıktan sonra yeniden tamamlanırsa bir hafta sonra yine arşive gider', () => {
    const task = completedTask(20);
    set('tasks', task.id, { unarchived_at: isoDaysAgo(15) });
    expect(taskRepo.listArchived(userId, today)).toHaveLength(0);

    set('tasks', task.id, { completed_at: isoDaysAgo(8) }); // reopened and completed again
    expect(ids(taskRepo.listArchived(userId, today))).toEqual([task.id]);
  });

  it('Bugün: başka güne bakınca arşivdekiler gelecekte gizli, geçmişte tarihçe olarak görünür', () => {
    const past = completedTask(10);
    const future = taskRepo.create({ user_id: userId, title: 'Erken bitti', due_date: shiftYmd(today, 5) });
    set('tasks', future.id, { completed_at: isoDaysAgo(9) });

    expect(ids(taskRepo.listByDueDate(userId, shiftYmd(today, -10), true, today))).toEqual([past.id]);
    expect(taskRepo.listByDueDate(userId, shiftYmd(today, 5), false, today)).toHaveLength(0);
  });

  it('benimle paylaşılan görevi geri almak yalnız yerel işarettir (push edilmez)', () => {
    const task = completedTask(10);
    set('tasks', task.id, { shared_owner_uid: 'friend-uid', synced: 1 });
    taskRepo.unarchive(task.id);

    const back = taskRepo.getById(task.id)!;
    expect(back.unarchived_at).not.toBeNull();
    expect(back.synced).toBe(1);
    expect(taskRepo.listArchived(userId, today)).toHaveLength(0);
  });
});

describe('hedefler', () => {
  function numericGoal() {
    return goalRepo.create({ user_id: userId, title: '100 km', goal_type: 'numeric', target_value: 100, unit: 'km' });
  }

  it('sayısal hedef hedefe ulaşınca completed_at alır, altına düşünce kaybeder', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 60);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();

    goalRepo.addProgress(goal.id, 40);
    const done = goalRepo.getById(goal.id)!.completed_at;
    expect(done).not.toBeNull();

    goalRepo.addProgress(goal.id, 5); // staying above keeps the first completion time
    expect(goalRepo.getById(goal.id)!.completed_at).toBe(done);

    goalRepo.addProgress(goal.id, -50);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });

  it('hedef değeri düşürülünce de tamamlanmış sayılır', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 60);
    goalRepo.update(goal.id, { target_value: 50 });
    expect(goalRepo.getById(goal.id)!.completed_at).not.toBeNull();
    goalRepo.update(goal.id, { target_value: 80 });
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });

  it('tamamlandıktan sonra 2 gün listede kalır, 3. gün arşive gider', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 100);
    expect(ids(goalRepo.listActive(userId, today))).toContain(goal.id);
    expect(ids(goalRepo.listActive(userId, shiftYmd(today, 2)))).toContain(goal.id);
    expect(goalRepo.listArchived(userId, shiftYmd(today, 2))).toHaveLength(0);
    expect(ids(goalRepo.listArchived(userId, shiftYmd(today, 3)))).toEqual([goal.id]);
    expect(ids(goalRepo.listActive(userId, shiftYmd(today, 3)))).not.toContain(goal.id);
    // Stats and reminders still see it.
    expect(ids(goalRepo.listByUser(userId))).toContain(goal.id);
  });

  it('adımlı hedef de 3 gün sonra arşive gider; geri alınınca listede kalır', () => {
    const goal = goalRepo.create({ user_id: userId, title: 'Taşın', goal_type: 'milestone' });
    goalRepo.setCompleted(goal.id, true);
    set('goals', goal.id, { completed_at: isoDaysAgo(2) });
    expect(goalRepo.listArchived(userId, today)).toHaveLength(0);
    set('goals', goal.id, { completed_at: isoDaysAgo(3) });
    expect(ids(goalRepo.listArchived(userId, today))).toEqual([goal.id]);

    goalRepo.unarchive(goal.id);
    expect(goalRepo.listArchived(userId, today)).toHaveLength(0);
    expect(ids(goalRepo.listActive(userId, today))).toContain(goal.id);
    expect(goalRepo.getById(goal.id)!.completed_at).not.toBeNull();
  });
});

describe('alışkanlıklar', () => {
  it('bitiş tarihinden 3 gün sonra arşive gider; ondan önce ve bitişsizler listede kalır', () => {
    const ended = habitRepo.create({ user_id: userId, title: 'Bitti', end_date: shiftYmd(today, -3) });
    const recent = habitRepo.create({ user_id: userId, title: 'Yeni bitti', end_date: shiftYmd(today, -2) });
    const lastDay = habitRepo.create({ user_id: userId, title: 'Son gün', end_date: today });
    const open = habitRepo.create({ user_id: userId, title: 'Süresiz' });

    expect(ids(habitRepo.listArchived(userId, today))).toEqual([ended.id]);
    expect(ids(habitRepo.listActive(userId, today)).sort()).toEqual([recent.id, lastDay.id, open.id].sort());
    expect(habitRepo.listByUser(userId)).toHaveLength(4);
  });

  it('geri alınan alışkanlık kalır; bitiş tarihi ileri alınıp yine geçince tekrar arşivlenir', () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Bitti', end_date: shiftYmd(today, -3) });
    habitRepo.unarchive(habit.id);
    expect(habitRepo.listArchived(userId, today)).toHaveLength(0);
    expect(habitRepo.getById(habit.id)!.synced).toBe(0);

    habitRepo.update(habit.id, { end_date: shiftYmd(today, 2) });
    expect(habitRepo.listArchived(userId, shiftYmd(today, 4))).toHaveLength(0);
    expect(ids(habitRepo.listArchived(userId, shiftYmd(today, 5)))).toEqual([habit.id]);
  });
});

describe('migration024', () => {
  it('zaten tamamlanmış sayısal hedeflere son düzenleme anını tamamlanma anı olarak yazar', () => {
    __resetAllDatabases();
    const db = getDb();
    for (const m of migrations.filter((x) => x.version < 24)) db.execSync(m.sql);
    db.runSync(
      `INSERT INTO users (id, email, is_anonymous, updated_at, deleted_at, synced)
       VALUES ('u1', NULL, 1, '2026-07-01T00:00:00.000Z', NULL, 1)`
    );
    const insert = (id: string, type: string, current: number) =>
      db.runSync(
        `INSERT INTO goals (id, user_id, title, goal_type, target_value, current_value, updated_at, synced)
         VALUES (?, 'u1', 'H', ?, 100, ?, '2026-07-05T08:00:00.000Z', 1)`,
        [id, type, current]
      );
    insert('done', 'numeric', 120);
    insert('half', 'numeric', 50);
    insert('steps', 'milestone', 0);

    db.execSync(migrations.find((m) => m.version === 24)!.sql);

    const completed = (id: string) =>
      db.getFirstSync<{ completed_at: string | null }>(`SELECT completed_at FROM goals WHERE id = ?`, [id])!
        .completed_at;
    expect(completed('done')).toBe('2026-07-05T08:00:00.000Z');
    expect(completed('half')).toBeNull();
    expect(completed('steps')).toBeNull();
  });
});
