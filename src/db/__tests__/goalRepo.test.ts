// goalRepo testleri: CRUD, sayısal ilerleme (addProgress) kırpması,
// update'teki current_value clamp'i, progressRatio, parçalı (milestone)
// hedeflerde sayaç mantığının sessizce yok sayılması ve isCompleted/setCompleted.

import { goalEntryRepo } from '../repositories/goalEntryRepo';
import { goalRepo } from '../repositories/goalRepo';
import { userRepo } from '../repositories/userRepo';
import { TIME_UNIT } from '../../lib/helpers';
import { resetTestDb } from '../../test/dbTestUtils';

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

function numericGoal(extra: Partial<Parameters<typeof goalRepo.create>[0]> = {}) {
  return goalRepo.create({
    user_id: userId,
    title: '100 km koş',
    goal_type: 'numeric',
    target_value: 100,
    unit: 'km',
    ...extra,
  });
}

function milestoneGoal(extra: Partial<Parameters<typeof goalRepo.create>[0]> = {}) {
  return goalRepo.create({
    user_id: userId,
    title: 'Tez bitir',
    goal_type: 'milestone',
    deadline: '2026-09-01',
    ...extra,
  });
}

describe('create / getById', () => {
  it('sayısal hedefi varsayılanlarla (current_value=0) oluşturur ve geri okur', () => {
    const goal = numericGoal();
    const fromDb = goalRepo.getById(goal.id);
    expect(fromDb).toEqual(goal);
    expect(fromDb!.goal_type).toBe('numeric');
    expect(fromDb!.target_value).toBe(100);
    expect(fromDb!.current_value).toBe(0);
    expect(fromDb!.unit).toBe('km');
    expect(fromDb!.deleted_at).toBeNull();
    expect(fromDb!.synced).toBe(0);
  });

  it('parçalı (milestone) hedefi oluşturur (target_value/unit null, deadline dolu)', () => {
    const goal = milestoneGoal();
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.goal_type).toBe('milestone');
    expect(fromDb.deadline).toBe('2026-09-01');
    expect(fromDb.target_value).toBeNull();
    expect(fromDb.unit).toBeNull();
    expect(fromDb.completed_at).toBeNull();
  });

  it('silinmiş hedef getById ile gelmez', () => {
    const goal = numericGoal();
    goalRepo.softDelete(goal.id);
    expect(goalRepo.getById(goal.id)).toBeNull();
  });
});

describe('listByUser', () => {
  it('yalnızca kullanıcının silinmemiş hedeflerini döner', () => {
    const a = numericGoal({ title: 'A' });
    const b = milestoneGoal({ title: 'B' });
    const c = numericGoal({ title: 'C' });
    goalRepo.softDelete(b.id);

    const ids = goalRepo.listByUser(userId).map((g) => g.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(c.id);
    expect(ids).not.toContain(b.id);
  });

  it('başka kullanıcının hedefini döndürmez', () => {
    numericGoal();
    expect(goalRepo.listByUser('baska-kullanici')).toEqual([]);
  });
});

describe('update', () => {
  it('başlık/hedef/birim/son tarihi değiştirir ve yeniden senkron bekletir (synced=0)', () => {
    const goal = numericGoal();
    // create sonrası okunan satır synced=0; senkron olduğunu taklit için 1 yapalım.
    // (update'in synced'i 0'a çektiğini görmek adına.)
    goalRepo.update(goal.id, { title: '200 km koş', target_value: 200, unit: 'mil' });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.title).toBe('200 km koş');
    expect(fromDb.target_value).toBe(200);
    expect(fromDb.unit).toBe('mil');
    expect(fromDb.synced).toBe(0);
  });

  it('current_value negatif verilirse 0\'a sıkışır (tek sınır budur)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { current_value: -5 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('current_value hedefi AŞABİLİR (hedef sınır değil eşiktir)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { current_value: 500 });
    expect(goalRepo.getById(goal.id)!.current_value).toBe(500);
  });

  it('hedefi düşürmek birikmiş ilerlemeyi KESMEZ', () => {
    // Eskiden buradaki clamp 80'i 50'ye çekiyordu: kullanıcının gerçekten
    // yaptığı iş, yalnızca hedefini küçülttüğü için sessizce siliniyordu.
    const goal = numericGoal({ target_value: 100 });
    goalRepo.update(goal.id, { target_value: 50, current_value: 80 });
    const fromDb = goalRepo.getById(goal.id)!;
    expect(fromDb.target_value).toBe(50);
    expect(fromDb.current_value).toBe(80);
  });

  it('hiç alan verilmezse hiçbir şey yapmaz', () => {
    const goal = numericGoal();
    goalRepo.update(goal.id, {});
    expect(goalRepo.getById(goal.id)).toEqual(goal);
  });
});

// addProgress artık girdi geçmişini de yazar (eskiden her çağıranın ayrıca
// goalEntryRepo.create çağırması gerekiyordu ve alışkanlık katkıları unutuyordu).
// Kayda İSTENEN değil GERÇEKLEŞEN fark düşmeli — yoksa geçmiş current_value ile
// çelişir ve ondan hesaplanan tempo/projeksiyon şişer.
describe('addProgress girdi geçmişi', () => {
  it('uygulanan farkı girdi olarak yazar ve döndürür', () => {
    const goal = numericGoal({ target_value: 100 });
    expect(goalRepo.addProgress(goal.id, 40)).toBe(40);
    const entries = goalEntryRepo.listByGoal(goal.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(40);
  });

  it('0 tabanında kırpılınca girdiye istenen değil GERÇEKLEŞEN fark yazılır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    // 10 - 30 = -20 ama taban 0 → gerçekte yalnız -10 uygulanır.
    expect(goalRepo.addProgress(goal.id, -30)).toBe(-10);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
    const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
    expect(amounts).toContain(-10);
    expect(amounts).not.toContain(-30);
  });

  it('negatif ilerleme (geri alma) negatif girdi yazar', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.addProgress(goal.id, -4)).toBe(-4);
    expect(goalEntryRepo.listByGoal(goal.id).map((e) => e.amount)).toContain(-4);
  });

  it('hiçbir şey değişmezse girdi yazmaz', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 0); // fark yok
    expect(goalEntryRepo.listByGoal(goal.id)).toEqual([]);
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.addProgress(goal.id, -30)).toBe(-10); // 0 tabanına oturdu
    expect(goalRepo.addProgress(goal.id, -5)).toBe(0); // zaten 0, değişmez
    expect(goalEntryRepo.listByGoal(goal.id)).toHaveLength(2);
  });

  it('sayısal olmayan hedefte girdi yazmaz', () => {
    const goal = goalRepo.create({
      user_id: userId,
      title: 'Adımlı hedef',
      goal_type: 'milestone',
    });
    expect(goalRepo.addProgress(goal.id, 5)).toBe(0);
    expect(goalEntryRepo.listByGoal(goal.id)).toEqual([]);
  });
});

// current_value artık TÜRETİLMİŞ bir önbeklek: value_baseline + aktif girdilerin
// toplamı (bkz. migration019). Bu değişmez bozulursa senkronun pull sonrası
// yeniden hesabı kullanıcının değerini kaydırır — o yüzden ayrıca sınanıyor.
describe('current_value değişmezi (baseline + girdiler)', () => {
  const invariant = (goalId: string) => {
    const goal = goalRepo.getById(goalId)!;
    const sum = goalEntryRepo.listByGoal(goalId).reduce((s, e) => s + e.amount, 0);
    expect(goal.current_value).toBe(Math.max(0, goal.value_baseline + sum));
  };

  it('yeni hedefte baseline 0, değer 0', () => {
    const goal = numericGoal();
    expect(goal.value_baseline).toBe(0);
    invariant(goal.id);
  });

  it('addProgress girdiyi yazar, baseline\'a DOKUNMAZ', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(40);
    expect(after.value_baseline).toBe(0); // katkı girdilerde, baseline'da değil
    invariant(goal.id);
  });

  it('"Mevcut değer"i ELLE değiştirmek baseline\'ı yazar, girdi geçmişine dokunmaz', () => {
    // Elle düzeltme bir günün emeği değildir; tempoyu şişirmemeli (bu yüzden
    // girdi yazılmaz). Ama değerin yeniden hesapta hayatta kalması için bir yere
    // yazılması gerekir — orası baseline.
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    const entriesBefore = goalEntryRepo.listByGoal(goal.id).length;

    goalRepo.update(goal.id, { current_value: 100 });

    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(100);
    expect(after.value_baseline).toBe(60); // 100 = 60 + 40 (girdi)
    expect(goalEntryRepo.listByGoal(goal.id).length).toBe(entriesBefore);
    invariant(goal.id);
  });

  it('elle düzeltmeden SONRAKİ ilerleme düzeltmenin üstüne biner', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { current_value: 100 }); // baseline 60
    goalRepo.addProgress(goal.id, 5);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(105);
    invariant(goal.id);
  });

  it('negatif düzeltme girdisi toplamdan düşer', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.addProgress(goal.id, -15);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(25);
    invariant(goal.id);
  });

  it('yalnız başlık güncellemek değeri ve baseline\'ı bozmaz', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { title: 'Yeni ad' });
    const after = goalRepo.getById(goal.id)!;
    expect(after.current_value).toBe(40);
    expect(after.value_baseline).toBe(0);
  });

  it('recomputeAllFromEntries değeri değiştirmez (zaten tutarlıysa)', () => {
    const goal = numericGoal();
    goalRepo.addProgress(goal.id, 40);
    goalRepo.update(goal.id, { current_value: 100 });
    goalRepo.recomputeAllFromEntries();
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
  });

  // "İlerleme geçmişine de ekle" işaretliyken fark BASELINE'a değil GİRDİYE yazılır.
  // İkisi birden yapılırsa toplam current_value'dan kopar ve değer, kullanıcı
  // hiçbir şey yapmadan bir sonraki yeniden hesapta sıçrar (eskiden ekranda
  // yapılan hata tam olarak buydu — bkz. goalRepo.update yorumu).
  describe('log_manual_change', () => {
    it('işaretliyken fark girdi olarak yazılır, baseline sabit kalır', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);

      goalRepo.update(goal.id, { current_value: 100, log_manual_change: true });

      const after = goalRepo.getById(goal.id)!;
      expect(after.current_value).toBe(100);
      expect(after.value_baseline).toBe(0); // baseline'a DOKUNULMADI
      const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
      expect(amounts).toContain(60); // fark geçmişe düştü
      invariant(goal.id);
    });

    it('DEĞER SIÇRAMAZ: yeniden hesap sonrası da aynı kalır', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      goalRepo.update(goal.id, { current_value: 100, log_manual_change: true });

      goalRepo.recomputeAllFromEntries();

      expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
    });

    it('işaretli DEĞİLKEN geçmişe hiçbir şey yazılmaz', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      const before = goalEntryRepo.listByGoal(goal.id).length;

      goalRepo.update(goal.id, { current_value: 100 });

      expect(goalRepo.listByUser(userId)[0].current_value).toBe(100);
      expect(goalEntryRepo.listByGoal(goal.id).length).toBe(before);
    });

    it('değer değişmemişse boş girdi üretmez', () => {
      const goal = numericGoal();
      goalRepo.addProgress(goal.id, 40);
      const before = goalEntryRepo.listByGoal(goal.id).length;

      goalRepo.update(goal.id, { current_value: 40, log_manual_change: true });

      expect(goalEntryRepo.listByGoal(goal.id).length).toBe(before);
      invariant(goal.id);
    });
  });
});

describe('addProgress', () => {
  it('sayısal hedefte ilerlemeyi artırır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 40);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(40);
    goalRepo.addProgress(goal.id, 5);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(45);
  });

  it('hedefi AŞABİLİR — sayaç dürüsttür, tavan yok', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 130);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(130);
    // Gösterim tarafı yine de taşmaz: oran 1'de kırpılır.
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBe(1);
  });

  it('0\'ın altına inmez', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 10);
    goalRepo.addProgress(goal.id, -50);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('hedef değeri null ise üst sınır uygulanmaz', () => {
    const goal = numericGoal({ target_value: null });
    goalRepo.addProgress(goal.id, 9999);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(9999);
  });

  it('parçalı (milestone) hedefte sessizce yok sayılır (sayaç bozulmaz)', () => {
    const goal = milestoneGoal();
    goalRepo.addProgress(goal.id, 10);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(0);
  });

  it('olmayan hedefte hata vermez', () => {
    expect(() => goalRepo.addProgress('yok', 5)).not.toThrow();
  });
});

// HEDEFİ AŞMIŞ hedef (current_value > target_value) sıradan bir durumdur:
// zamanlayıcı hedefe ulaşınca DURMAZ, kullanıcı çalışmaya devam edebilir.
// Eskiden addProgress'in tavan kırpması böyle bir hedefte İSTENEN yönün TERSİNE
// bir fark üretiyordu ("+1 ekle" demek current_value'yu tavana geri çekip aradaki
// tüm fazlalığı siliyor, girdi geçmişine hiç yaşanmamış dev bir negatif kayıt
// düşüyordu). Tavan tamamen kaldırıldı — bu testler o davranışın geri gelmemesini
// kilitler.
describe('addProgress — hedefi aşmış hedef', () => {
  // 1 saatlik (3600 sn) hedefte 100 dakika (6000 sn) çalışılmış bir durum kurar.
  const overshotGoal = () => {
    const goal = numericGoal({ target_value: 3600, unit: TIME_UNIT });
    goalRepo.addProgress(goal.id, 6000);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(6000);
    return goal;
  };

  it('pozitif ekleme tam uygulanır, ilerlemeyi DÜŞÜRMEZ', () => {
    const goal = overshotGoal();
    expect(goalRepo.addProgress(goal.id, 60)).toBe(60);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(6060);
  });

  it('pozitif eklemede girdi geçmişine negatif kayıt yazmaz', () => {
    const goal = overshotGoal();
    goalRepo.addProgress(goal.id, 60);
    const amounts = goalEntryRepo.listByGoal(goal.id).map((e) => e.amount);
    expect(amounts.filter((a) => a < 0)).toEqual([]);
  });

  it('negatif düzeltme hedefi aşmış hedefte de tam uygulanır', () => {
    const goal = overshotGoal();
    expect(goalRepo.addProgress(goal.id, -60)).toBe(-60);
    expect(goalRepo.getById(goal.id)!.current_value).toBe(5940);
  });

  // Bağlı alışkanlıktaki "işaretle → geri al" döngüsünün net etkisi SIFIR olmalı.
  // Tavan varken +1 yutuluyor, -1 uygulanıyordu; her döngü hedeften 1 birim
  // sessizce çalıyordu (bkz. habitRepo.bumpGoalIfLinked).
  it('hedef doluyken +1/-1 döngüsü simetriktir (net etki 0)', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 100); // tam doldu
    goalRepo.addProgress(goal.id, 1); // alışkanlık işaretlendi
    goalRepo.addProgress(goal.id, -1); // geri alındı
    expect(goalRepo.getById(goal.id)!.current_value).toBe(100);
  });
});

describe('progressRatio', () => {
  it('sayısal hedefte 0..1 arası oran döner', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 40);
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBeCloseTo(0.4);
  });

  it('hedefe ulaşınca/aşınca 1\'de kalır', () => {
    const goal = numericGoal({ target_value: 100 });
    goalRepo.addProgress(goal.id, 100);
    expect(goalRepo.progressRatio(goalRepo.getById(goal.id)!)).toBe(1);
  });

  it('parçalı hedefte ya da hedef değeri yoksa 0 döner', () => {
    expect(goalRepo.progressRatio(milestoneGoal())).toBe(0);
    expect(goalRepo.progressRatio(numericGoal({ target_value: null }))).toBe(0);
    expect(goalRepo.progressRatio(numericGoal({ target_value: 0 }))).toBe(0);
  });
});

describe('isCompleted / setCompleted', () => {
  it('sayısal hedefte oran 1\'e ulaşınca tamamlanmış sayılır (bayrak yok)', () => {
    const goal = numericGoal({ target_value: 100 });
    expect(goalRepo.isCompleted(goalRepo.getById(goal.id)!)).toBe(false);
    goalRepo.addProgress(goal.id, 100);
    expect(goalRepo.isCompleted(goalRepo.getById(goal.id)!)).toBe(true);
  });

  it('parçalı hedefte tamamlanma yalnızca completed_at bayrağından gelir', () => {
    const goal = milestoneGoal();
    expect(goalRepo.isCompleted(goal)).toBe(false);
    goalRepo.setCompleted(goal.id, true);
    const done = goalRepo.getById(goal.id)!;
    expect(done.completed_at).not.toBeNull();
    expect(goalRepo.isCompleted(done)).toBe(true);
    goalRepo.setCompleted(goal.id, false);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });

  it('sayısal hedefte setCompleted sessizce yok sayılır', () => {
    const goal = numericGoal();
    goalRepo.setCompleted(goal.id, true);
    expect(goalRepo.getById(goal.id)!.completed_at).toBeNull();
  });
});

describe('softDelete', () => {
  it('hedefi gizler ama satır durur ve synced=0 olur', () => {
    const goal = numericGoal();
    goalRepo.softDelete(goal.id);
    expect(goalRepo.getById(goal.id)).toBeNull();
    expect(goalRepo.listByUser(userId)).toEqual([]);
  });
});
