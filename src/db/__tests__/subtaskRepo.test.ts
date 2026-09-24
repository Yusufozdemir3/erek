// subtaskRepo tests: insertion order (position), toggle, soft delete, counting.

import { subtaskRepo } from '../repositories/subtaskRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let taskId: string;

beforeEach(async () => {
  await resetTestDb();
  const userId = userRepo.getOrCreateLocal().id;
  taskId = taskRepo.create({ user_id: userId, title: 'Ana görev' }).id;
});

describe('create / listByTask', () => {
  it('eklenme sırasını korur (position artar)', () => {
    subtaskRepo.create(taskId, 'Birinci');
    subtaskRepo.create(taskId, 'İkinci');
    subtaskRepo.create(taskId, 'Üçüncü');

    const list = subtaskRepo.listByTask(taskId);
    expect(list.map((s) => s.title)).toEqual(['Birinci', 'İkinci', 'Üçüncü']);
    expect(list.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('yeni alt görev synced=0 ve completed=0 başlar', () => {
    const s = subtaskRepo.create(taskId, 'Yeni');
    expect(s.synced).toBe(0);
    expect(s.completed).toBe(0);
  });
});

describe('setCompleted', () => {
  it('işaretler, geri alır ve satırı yeniden senkron bekletir', () => {
    const s = subtaskRepo.create(taskId, 'Madde');

    subtaskRepo.setCompleted(s.id, true);
    expect(subtaskRepo.listByTask(taskId)[0].completed).toBe(1);

    subtaskRepo.setCompleted(s.id, false);
    const after = subtaskRepo.listByTask(taskId)[0];
    expect(after.completed).toBe(0);
    expect(after.synced).toBe(0);
  });
});

describe('softDelete', () => {
  it('listeden düşürür ama satır durur; position boşluğu sorun değil', () => {
    const a = subtaskRepo.create(taskId, 'A');
    subtaskRepo.create(taskId, 'B');

    subtaskRepo.softDelete(a.id);

    const list = subtaskRepo.listByTask(taskId);
    expect(list.map((s) => s.title)).toEqual(['B']);

    // One added after a deletion continues from the highest position.
    subtaskRepo.create(taskId, 'C');
    expect(subtaskRepo.listByTask(taskId).map((s) => s.title)).toEqual(['B', 'C']);
  });
});

describe('countForTask', () => {
  it('tamamlanan/toplam sayar, silinenleri saymaz', () => {
    expect(subtaskRepo.countForTask(taskId)).toEqual({ done: 0, total: 0 });

    const a = subtaskRepo.create(taskId, 'A');
    const b = subtaskRepo.create(taskId, 'B');
    subtaskRepo.create(taskId, 'C');
    subtaskRepo.setCompleted(a.id, true);

    expect(subtaskRepo.countForTask(taskId)).toEqual({ done: 1, total: 3 });

    subtaskRepo.softDelete(b.id);
    expect(subtaskRepo.countForTask(taskId)).toEqual({ done: 1, total: 2 });
  });
});

describe('countsForTasks (çoklu)', () => {
  it('boş liste için boş nesne döner (geçersiz IN () sorgusu kurulmaz)', () => {
    expect(subtaskRepo.countsForTasks([])).toEqual({});
  });

  it('yalnızca alt görevi olan görevleri döner; countForTask ile aynı sayar', () => {
    const userId = userRepo.getOrCreateLocal().id;
    const other = taskRepo.create({ user_id: userId, title: 'Diğer görev' }).id;
    const empty = taskRepo.create({ user_id: userId, title: 'Alt görevsiz' }).id;

    const a = subtaskRepo.create(taskId, 'A');
    subtaskRepo.create(taskId, 'B');
    subtaskRepo.setCompleted(a.id, true);
    const c = subtaskRepo.create(other, 'C');
    subtaskRepo.setCompleted(c.id, true);

    const counts = subtaskRepo.countsForTasks([taskId, other, empty]);
    expect(counts).toEqual({
      [taskId]: { done: 1, total: 2 },
      [other]: { done: 1, total: 1 },
    });
    // A task with no subtasks never appears in the result at all.
    expect(counts[empty]).toBeUndefined();
    // Matches the single-task countForTask exactly.
    expect(counts[taskId]).toEqual(subtaskRepo.countForTask(taskId));
  });

  it('silinen alt görevleri saymaz', () => {
    const a = subtaskRepo.create(taskId, 'A');
    subtaskRepo.create(taskId, 'B');
    subtaskRepo.softDelete(a.id);
    expect(subtaskRepo.countsForTasks([taskId])).toEqual({ [taskId]: { done: 0, total: 1 } });
  });
});
