// reminderRepo testleri: create/listByEntity, replaceAll, mapByType, soft delete.

import { habitRepo } from '../repositories/habitRepo';
import { reminderRepo } from '../repositories/reminderRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let habitId: string;
let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
  habitId = habitRepo.create({ user_id: userId, title: 'Su iç' }).id;
});

describe('create / listByEntity', () => {
  it('saate göre artan sırada döner', () => {
    reminderRepo.create('habit', habitId, '20:00');
    reminderRepo.create('habit', habitId, '08:00');
    reminderRepo.create('habit', habitId, '12:00');

    const list = reminderRepo.listByEntity('habit', habitId);
    expect(list.map((r) => r.time)).toEqual(['08:00', '12:00', '20:00']);
  });

  it('farklı entity_type/entity_id kayıtlarını karıştırmaz', () => {
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    reminderRepo.create('habit', habitId, '09:00');
    reminderRepo.create('task', task.id, '10:00');

    expect(reminderRepo.listByEntity('habit', habitId).map((r) => r.time)).toEqual(['09:00']);
    expect(reminderRepo.listByEntity('task', task.id).map((r) => r.time)).toEqual(['10:00']);
  });

  it('yeni hatırlatma synced=0 başlar', () => {
    const r = reminderRepo.create('habit', habitId, '09:00');
    expect(r.synced).toBe(0);
    expect(r.deleted_at).toBeNull();
  });
});

describe('deleteAllForEntity', () => {
  it('bir varlığın tüm hatırlatmalarını yumuşak siler, başkasınınkine dokunmaz', () => {
    const other = habitRepo.create({ user_id: userId, title: 'Koşu' }).id;
    reminderRepo.create('habit', habitId, '08:00');
    reminderRepo.create('habit', habitId, '20:00');
    reminderRepo.create('habit', other, '07:00');

    reminderRepo.deleteAllForEntity('habit', habitId);

    expect(reminderRepo.listByEntity('habit', habitId)).toEqual([]);
    expect(reminderRepo.listByEntity('habit', other).map((r) => r.time)).toEqual(['07:00']);
  });
});

describe('replaceAll', () => {
  it('eski listeyi yenisiyle değiştirir', () => {
    reminderRepo.create('habit', habitId, '08:00');
    reminderRepo.create('habit', habitId, '20:00');

    const result = reminderRepo.replaceAll('habit', habitId, ['09:00', '21:00']);

    expect(result.map((r) => r.time)).toEqual(['09:00', '21:00']);
    expect(reminderRepo.listByEntity('habit', habitId).map((r) => r.time)).toEqual(['09:00', '21:00']);
  });

  it('boş liste verilince tüm hatırlatmaları kaldırır', () => {
    reminderRepo.create('habit', habitId, '08:00');
    const result = reminderRepo.replaceAll('habit', habitId, []);
    expect(result).toEqual([]);
    expect(reminderRepo.listByEntity('habit', habitId)).toEqual([]);
  });
});

describe('mapByType', () => {
  it('bir tipin TÜM varlıklarını entity_id\'ye göre gruplar', () => {
    const other = habitRepo.create({ user_id: userId, title: 'Koşu' }).id;
    const task = taskRepo.create({ user_id: userId, title: 'Görev' });
    reminderRepo.create('habit', habitId, '08:00');
    reminderRepo.create('habit', habitId, '20:00');
    reminderRepo.create('habit', other, '07:00');
    reminderRepo.create('task', task.id, '10:00');

    const map = reminderRepo.mapByType('habit');
    expect(map.get(habitId)!.map((r) => r.time)).toEqual(['08:00', '20:00']);
    expect(map.get(other)!.map((r) => r.time)).toEqual(['07:00']);
    expect(map.has(task.id)).toBe(false);
  });

  it('hiç hatırlatması olmayan tipte boş map döner', () => {
    expect(reminderRepo.mapByType('goal').size).toBe(0);
  });
});
