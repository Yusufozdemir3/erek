// goalEntryRepo testleri: girdi geçmişi yalnızca bir GÜNLÜKTÜR — goals.current_value'yu
// ASLA değiştirmez (bkz. dosya başı yorumu), yalnızca "ne zaman ne kadar eklendi"
// kaydını tutar. subtaskRepo/goalMilestoneRepo ile aynı desen.

import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

// updated_at milisaniye çözünürlüklü; art arda iki create aynı milisaniyeye
// düşerse listByGoal'ın ORDER BY updated_at DESC'i (ikincil bir sıra anahtarı
// olmadığından) "en yeni önce" garantisi vermez. Sıralamayı test eden
// senaryolarda gerçek bir saat farkı olsun diye kısa bir bekleme kullanılır.
const tick = () => new Promise((r) => setTimeout(r, 20));

let goalId: string;

beforeEach(async () => {
  await resetTestDb();
  const userId = userRepo.getOrCreateLocal().id;
  goalId = goalRepo.create({ user_id: userId, title: 'Kitap oku', goal_type: 'numeric', target_value: 100 }).id;
});

describe('create / listByGoal', () => {
  it('en yeniden en eskiye sıralı döner', async () => {
    const first = goalEntryRepo.create(goalId, 5);
    await tick();
    const second = goalEntryRepo.create(goalId, 10);

    const list = goalEntryRepo.listByGoal(goalId);
    expect(list.map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it('negatif miktar (düzeltme) da kaydedilebilir', () => {
    goalEntryRepo.create(goalId, -3);
    expect(goalEntryRepo.listByGoal(goalId)[0].amount).toBe(-3);
  });

  it('yeni girdi synced=0 başlar, deleted_at null', () => {
    const e = goalEntryRepo.create(goalId, 7);
    expect(e.synced).toBe(0);
    expect(e.deleted_at).toBeNull();
  });

  it('goals.current_value\'yu ETKİLEMEZ — tek doğru kaynak yine goalRepo.addProgress', () => {
    const before = goalRepo.getById(goalId)!.current_value;
    goalEntryRepo.create(goalId, 40);
    const after = goalRepo.getById(goalId)!.current_value;
    expect(after).toBe(before); // 0'dan değişmedi
  });

  it('farklı hedeflerin girdilerini karıştırmaz', () => {
    const other = goalRepo.create({ user_id: userRepo.getOrCreateLocal().id, title: 'Diğer', goal_type: 'numeric' }).id;
    goalEntryRepo.create(goalId, 5);
    goalEntryRepo.create(other, 9);

    expect(goalEntryRepo.listByGoal(goalId).map((e) => e.amount)).toEqual([5]);
    expect(goalEntryRepo.listByGoal(other).map((e) => e.amount)).toEqual([9]);
  });

  it('hiç girdisi olmayan hedefte boş liste döner', () => {
    expect(goalEntryRepo.listByGoal(goalId)).toEqual([]);
  });
});

describe('goalRepo.addProgress ile entegrasyon', () => {
  it('addProgress her çağrıda GERÇEKLEŞEN farkı (0 tabanı sonrası) girdi olarak yazar', async () => {
    goalRepo.addProgress(goalId, 95); // 0 -> 95
    await tick();
    goalRepo.addProgress(goalId, -120); // 95 - 120 = -25 -> 0 tabanı, gerçek fark -95

    const entries = goalEntryRepo.listByGoal(goalId);
    expect(entries.map((e) => e.amount)).toEqual([-95, 95]); // en yeniden en eskiye
    expect(goalRepo.getById(goalId)!.current_value).toBe(0);
  });

  it('hedef dolu olsa bile ekleme UYGULANIR ve girdi yazılır (tavan yok)', async () => {
    goalRepo.addProgress(goalId, 100); // hedefi doldur
    await tick();
    const beforeCount = goalEntryRepo.listByGoal(goalId).length;

    // Hedef bir SINIR değil EŞİK: üstüne çalışmak da kaydedilir.
    expect(goalRepo.addProgress(goalId, 10)).toBe(10);

    expect(goalEntryRepo.listByGoal(goalId).length).toBe(beforeCount + 1);
    expect(goalRepo.getById(goalId)!.current_value).toBe(110);
  });

  it('gerçek fark 0 ise hiç girdi yazılmaz', () => {
    goalRepo.addProgress(goalId, 100);
    const beforeCount = goalEntryRepo.listByGoal(goalId).length;

    goalRepo.addProgress(goalId, 0); // hiçbir şey değişmiyor

    expect(goalEntryRepo.listByGoal(goalId).length).toBe(beforeCount);
  });
});
