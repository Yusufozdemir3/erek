// reassignLocalIds — the safety net of the account merge: a reference left
// pointing at an old id would hide a habit's logs or orphan a reminder.

import { getDb } from '@/db/database';
import { goalRepo } from '@/db/repositories/goalRepo';
import { habitRepo } from '@/db/repositories/habitRepo';
import { taskRepo } from '@/db/repositories/taskRepo';
import { subtaskRepo } from '@/db/repositories/subtaskRepo';
import { goalMilestoneRepo } from '@/db/repositories/goalMilestoneRepo';
import { reminderRepo } from '@/db/repositories/reminderRepo';
import { userRepo } from '@/db/repositories/userRepo';
import { resetTestDb } from '@/test/dbTestUtils';
import { reassignLocalIds } from '../localIds';

// A full setup that produces data + every kind of reference across all tables.
function seed() {
  const user = userRepo.getOrCreateLocal();
  const goal = goalRepo.create({
    user_id: user.id,
    title: 'Kitap',
    goal_type: 'numeric',
    target_value: 100,
  });
  const habit = habitRepo.create({ user_id: user.id, title: 'Oku', goal_id: goal.id });
  habitRepo.toggleLog(habit.id, '2026-07-01', true);
  habitRepo.toggleLog(habit.id, '2026-07-02', true);
  const task = taskRepo.create({ user_id: user.id, title: 'Görev' });
  subtaskRepo.create(task.id, 'Alt görev');
  goalMilestoneRepo.create(goal.id, 'İlk 50', { amount: 50 });
  goalRepo.addProgress(goal.id, 10); // produces a goal_entries row
  reminderRepo.create('habit', habit.id, '08:30');
  reminderRepo.create('task', task.id, '09:00');
  reminderRepo.create('goal', goal.id, '10:00');
  return { user, goal, habit, task };
}

const count = (t: string) =>
  getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

const ids = (t: string) =>
  getDb()
    .getAllSync<{ id: string }>(`SELECT id FROM ${t} ORDER BY id`)
    .map((r) => r.id);

beforeEach(async () => {
  await resetTestDb();
});

describe('reassignLocalIds — kimlikler', () => {
  it('tüm tablolarda id DEĞİŞİR', () => {
    seed();
    const before = {
      goals: ids('goals'),
      habits: ids('habits'),
      tasks: ids('tasks'),
      habit_logs: ids('habit_logs'),
      subtasks: ids('subtasks'),
      goal_milestones: ids('goal_milestones'),
      goal_entries: ids('goal_entries'),
      reminders: ids('reminders'),
    };

    reassignLocalIds();

    for (const [table, oldIds] of Object.entries(before)) {
      const newIds = ids(table);
      expect(newIds).toHaveLength(oldIds.length);
      for (const id of newIds) expect(oldIds).not.toContain(id);
    }
  });

  it('satır SAYILARI korunur (veri kaybı yok)', () => {
    seed();
    const before = ['goals', 'habits', 'tasks', 'habit_logs', 'subtasks', 'goal_milestones', 'goal_entries', 'reminders'].map(
      (t) => [t, count(t)] as const
    );

    reassignLocalIds();

    for (const [t, n] of before) expect(count(t)).toBe(n);
  });

  it('users tablosuna DOKUNULMAZ (cihaz kimliği korunur)', () => {
    const { user } = seed();
    reassignLocalIds();
    expect(userRepo.getOrCreateLocal().id).toBe(user.id);
  });
});

describe('reassignLocalIds — referans bütünlüğü', () => {
  it('alışkanlığın logları yeni id ile bağlı kalır', () => {
    const { habit } = seed();
    const logsBefore = habitRepo.allLogs(habit.id).length;

    const { habitIdMap } = reassignLocalIds();
    const newHabitId = habitIdMap.get(habit.id)!;

    expect(newHabitId).toBeTruthy();
    expect(habitRepo.allLogs(newHabitId)).toHaveLength(logsBefore);
    expect(habitRepo.allLogs(habit.id)).toHaveLength(0); // the old id no longer exists
  });

  it('görevin alt görevleri bağlı kalır', () => {
    seed();
    reassignLocalIds();
    const taskId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM tasks`)!.id;
    expect(subtaskRepo.listByTask(taskId)).toHaveLength(1);
  });

  it('hedefin adımları ve girdileri bağlı kalır', () => {
    seed();
    reassignLocalIds();
    const goalId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM goals`)!.id;
    expect(goalMilestoneRepo.listByGoal(goalId)).toHaveLength(1);
    // Entries: the manually added +10 AND the two completions of the linked habit
    // (habitRepo.bumpGoalIfLinked -> addProgress -> goalEntryRepo.create).
    expect(count('goal_entries')).toBe(3);
    const orphan = getDb().getAllSync<{ goal_id: string }>(
      `SELECT goal_id FROM goal_entries WHERE goal_id <> ?`,
      [goalId]
    );
    expect(orphan).toEqual([]); // all point to the new goal id
  });

  it('alışkanlığın hedef bağlantısı (goal_id) korunur', () => {
    seed();
    reassignLocalIds();
    const goalId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM goals`)!.id;
    const habitGoalId = getDb().getFirstSync<{ goal_id: string }>(
      `SELECT goal_id FROM habits`
    )!.goal_id;
    expect(habitGoalId).toBe(goalId);
  });

  it('hatırlatmalar DOĞRU ebeveyne bağlı kalır (entity_type karışmaz)', () => {
    seed();
    reassignLocalIds();
    const habitId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM habits`)!.id;
    const taskId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM tasks`)!.id;
    const goalId = getDb().getFirstSync<{ id: string }>(`SELECT id FROM goals`)!.id;

    expect(reminderRepo.listByEntity('habit', habitId).map((r) => r.time)).toEqual(['08:30']);
    expect(reminderRepo.listByEntity('task', taskId).map((r) => r.time)).toEqual(['09:00']);
    expect(reminderRepo.listByEntity('goal', goalId).map((r) => r.time)).toEqual(['10:00']);
  });

  it('sonuçta kırık referans KALMAZ (foreign_key_check temiz)', () => {
    seed();
    reassignLocalIds();
    const broken = getDb().getAllSync<Record<string, unknown>>('PRAGMA foreign_key_check;');
    expect(broken).toEqual([]);
  });
});

describe('reassignLocalIds — sınır durumlar', () => {
  it('boş veritabanında hata vermez', () => {
    userRepo.getOrCreateLocal();
    expect(() => reassignLocalIds()).not.toThrow();
  });

  it('kaç satırın kimliğinin değiştiğini raporlar', () => {
    seed();
    const { counts } = reassignLocalIds();
    expect(counts.habits).toBe(1);
    expect(counts.habit_logs).toBe(2);
    expect(counts.reminders).toBe(3);
  });

  it('FK kısıtları işlem sonrası TEKRAR AÇIK olur', () => {
    seed();
    reassignLocalIds();
    const on = getDb().getFirstSync<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    expect(on?.foreign_keys).toBe(1);
  });
});

describe('reassignLocalIds — etiketler', () => {
  it('etiketin id’si değişir ve görevlerin tag_ids listesi yeni id’ye döner', () => {
    const { tagRepo } = require('@/db/repositories/tagRepo') as typeof import('@/db/repositories/tagRepo');
    const user = userRepo.getOrCreateLocal();
    const work = tagRepo.create(user.id, 'İş', '#3b82f6')!;
    const home = tagRepo.create(user.id, 'Ev', null)!;
    const t1 = taskRepo.create({ user_id: user.id, title: 'Rapor', tag_ids: [work.id, home.id] });
    const t2 = taskRepo.create({ user_id: user.id, title: 'Market', tag_ids: [home.id] });
    // A friend's tag id (not in my tags table) is left alone.
    const t3 = taskRepo.create({ user_id: user.id, title: 'Yabancı', tag_ids: ['00000000-aaaa-bbbb-cccc-000000000000'] });

    const { counts } = reassignLocalIds();
    expect(counts.tags).toBe(2);

    const tags = tagRepo.listByUser(user.id);
    const byName = Object.fromEntries(tags.map((t) => [t.name, t.id]));
    expect(byName['İş']).not.toBe(work.id);
    expect(byName.Ev).not.toBe(home.id);

    const tasks = taskRepo.listByUser(user.id);
    const tagsOf = (title: string) => tasks.find((t) => t.title === title)!.tag_ids;
    expect(tagsOf('Rapor')).toEqual([byName['İş'], byName.Ev]);
    expect(tagsOf('Market')).toEqual([byName.Ev]);
    expect(tagsOf('Yabancı')).toEqual(['00000000-aaaa-bbbb-cccc-000000000000']);
    void t1;
    void t2;
    void t3;
  });
});
