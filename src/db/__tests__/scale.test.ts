// SCALE TESTS — the real-world sizes of a user who's been active for over a year.
//
// WHY THIS EXISTS: two changes in the P2/P3 rounds added behavior specific to
// large data — the Tasks screen's query limit (taskRepo.listForScreen) and
// keeping bulk habit queries from exceeding SQLite's `IN (…)` bound-parameter
// limit (helpers.chunk, SQL_PARAM_CHUNK). Both are the kind of bug that looks
// silently correct on small data and only breaks BEYOND the limit — that's
// why these tests deliberately run at sizes that EXCEED the limit.

import { habitRepo } from '../repositories/habitRepo';
import { subtaskRepo } from '../repositories/subtaskRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { SQL_PARAM_CHUNK } from '../../lib/helpers';
import { resetTestDb } from '../../test/dbTestUtils';

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
}, 30_000);

describe('taskRepo.listForScreen — büyük görev listesi', () => {
  it('binlerce görevde AKTİF olanların TAMAMI döner, eski tamamlananlar sınırla elenir', () => {
    const ACTIVE = 800;
    const OLD_COMPLETED = 1200;
    const RECENT_COMPLETED = 50;

    for (let i = 0; i < ACTIVE; i++) {
      taskRepo.create({ user_id: userId, title: `Aktif ${i}` });
    }
    const db = require('../database').getDb();
    for (let i = 0; i < OLD_COMPLETED; i++) {
      const t = taskRepo.create({ user_id: userId, title: `Eski ${i}` });
      db.runSync(`UPDATE tasks SET completed_at = ? WHERE id = ?`, ['2020-01-01T00:00:00.000Z', t.id]);
    }
    for (let i = 0; i < RECENT_COMPLETED; i++) {
      const t = taskRepo.create({ user_id: userId, title: `Yeni tamamlanan ${i}` });
      db.runSync(`UPDATE tasks SET completed_at = ? WHERE id = ?`, ['2026-06-15T00:00:00.000Z', t.id]);
    }

    const list = taskRepo.listForScreen(userId, '2026-06-01');

    // What the screen actually renders: 800 + 50, NOT ~2000 — this is the part
    // that has to stay smooth without needing virtualization.
    expect(list.length).toBe(ACTIVE + RECENT_COMPLETED);
    expect(taskRepo.countCompletedBefore(userId, '2026-06-01')).toBe(OLD_COMPLETED);

    // Ordering is preserved: incomplete ones stay on top.
    const firstCompletedIdx = list.findIndex((t) => t.completed_at !== null);
    expect(list.slice(0, firstCompletedIdx).every((t) => t.completed_at === null)).toBe(true);

    // "Show all" (since=null) really does return everything.
    expect(taskRepo.listForScreen(userId, null).length).toBe(ACTIVE + OLD_COMPLETED + RECENT_COMPLETED);
  }, 30_000);
});

describe('habitRepo — SQL_PARAM_CHUNK sınırını aşan alışkanlık sayısı', () => {
  it(`${SQL_PARAM_CHUNK}'den FAZLA alışkanlıkta getDayStates hiçbirini kaybetmez/kopyalamaz`, () => {
    const COUNT = SQL_PARAM_CHUNK + 137; // deliberately exceeds the limit
    const habits = Array.from({ length: COUNT }, (_, i) =>
      habitRepo.create({ user_id: userId, title: `Alışkanlık ${i}` })
    );
    const today = '2026-07-01';
    // Mark only PART of them — also exercises the ones that should be absent from the result.
    for (let i = 0; i < habits.length; i += 3) {
      habitRepo.toggleLog(habits[i].id, today, true);
    }

    const states = habitRepo.getDayStates(
      habits.map((h) => h.id),
      today
    );

    for (let i = 0; i < habits.length; i++) {
      if (i % 3 === 0) {
        expect(states[habits[i].id]).toEqual({ amount: 0, completed: true });
      } else {
        // An unmarked habit is absent from the result entirely (the contract
        // the repo documents) — chunking must not break that.
        expect(states[habits[i].id]).toBeUndefined();
      }
    }
  }, 30_000);

  it(`${SQL_PARAM_CHUNK}'den FAZLA alışkanlıkta completedDatesBetween parça sınırında BÖLÜNMEZ`, () => {
    const COUNT = SQL_PARAM_CHUNK + 50;
    const habits = Array.from({ length: COUNT }, (_, i) =>
      habitRepo.create({ user_id: userId, title: `A${i}` })
    );
    // Specifically mark the habits RIGHT AROUND the chunk boundary — an
    // off-by-one bug would drop a day into the wrong chunk exactly here.
    const boundary = [SQL_PARAM_CHUNK - 1, SQL_PARAM_CHUNK, SQL_PARAM_CHUNK + 1];
    for (const i of boundary) habitRepo.toggleLog(habits[i].id, '2026-07-05', true);

    const out = habitRepo.completedDatesBetween(
      habits.map((h) => h.id),
      '2026-07-01',
      '2026-07-10'
    );

    for (const i of boundary) {
      expect([...out[habits[i].id]]).toEqual(['2026-07-05']);
    }
    // Unmarked ones are absent from the result.
    expect(out[habits[0].id]).toBeUndefined();
  }, 30_000);
});

describe('subtaskRepo.countsForTasks — SQL_PARAM_CHUNK sınırını aşan görev sayısı', () => {
  it('parçalama alt görev sayımını bozmaz', () => {
    const COUNT = SQL_PARAM_CHUNK + 80;
    const tasks = Array.from({ length: COUNT }, (_, i) =>
      taskRepo.create({ user_id: userId, title: `G${i}` })
    );
    // Add subtasks to the tasks at the chunk boundary.
    const boundary = [SQL_PARAM_CHUNK - 1, SQL_PARAM_CHUNK, SQL_PARAM_CHUNK + 1];
    for (const i of boundary) {
      const s = subtaskRepo.create(tasks[i].id, 'Adım');
      subtaskRepo.setCompleted(s.id, true);
      subtaskRepo.create(tasks[i].id, 'Adım 2');
    }

    const counts = subtaskRepo.countsForTasks(tasks.map((t) => t.id));

    for (const i of boundary) {
      expect(counts[tasks[i].id]).toEqual({ done: 1, total: 2 });
    }
    expect(counts[tasks[0].id]).toBeUndefined(); // a task with no subtasks is absent
  }, 30_000);
});
