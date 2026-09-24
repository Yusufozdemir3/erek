// reassignLocalIds tests — the safety net for the "merge" flow.
// A broken reference not caught here turns into bugs that are very hard to
// diagnose in the field (e.g. a habit's logs become invisible, a reminder is orphaned).

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
