// migration019: hedef ilerlemesi artık TÜRETİLİYOR (current_value =
// value_baseline + aktif girdilerin toplamı).
//
// Bu migration'ın tek kritik sözü GERİYE UYUM: hiçbir hedefin GÖRÜNEN değerini
// değiştirmemeli, yalnız aynı sayıyı bundan sonra çakışmadan birleşebilir iki
// parçaya ayırmalı. Yanlış bir backfill, yayındaki her kullanıcının ilerlemesini
// sessizce kaydırırdı — bu yüzden migration'ın kendisi test ediliyor.
//
// Kurulum: migration listesi 19'dan ÖNCEYE kadar elle uygulanır, "eski dünya"
// verisi yazılır, sonra yalnız 019 çalıştırılır. Böylece üretimdeki SQL'in
// kendisi sınanır (kopya değil).

import { getDb } from '../database';
import { migrations } from '../migrations/001_initial';
import { __resetAllDatabases } from '../../test/mocks/expo-sqlite';

const V = 19;

function applyUpTo(exclusiveVersion: number): void {
  const db = getDb();
  for (const m of migrations.filter((x) => x.version < exclusiveVersion)) db.execSync(m.sql);
}

function applyV19(): void {
  getDb().execSync(migrations.find((m) => m.version === V)!.sql);
}

// goals.user_id -> users(id) FK'si var; hedeflerden önce sahibi eklenmeli.
function insertUser(): void {
  getDb().runSync(
    `INSERT INTO users (id, email, is_anonymous, updated_at, deleted_at, synced)
     VALUES ('u1', NULL, 1, '2026-07-01T00:00:00.000Z', NULL, 1)`
  );
}

function insertGoal(id: string, currentValue: number): void {
  getDb().runSync(
    `INSERT INTO goals (id, user_id, title, goal_type, target_value, current_value, unit,
                        deadline, remind_at, start_date, updated_at, deleted_at, synced)
     VALUES (?, 'u1', 'Hedef', 'numeric', 100, ?, 'km', NULL, NULL, NULL, '2026-07-01T00:00:00.000Z', NULL, 1)`,
    [id, currentValue]
  );
}

function insertEntry(goalId: string, amount: number, deleted = false): void {
  getDb().runSync(
    `INSERT INTO goal_entries (id, goal_id, amount, updated_at, deleted_at, synced)
     VALUES (?, ?, ?, '2026-07-01T00:00:00.000Z', ?, 1)`,
    [`e-${goalId}-${amount}-${deleted}`, goalId, amount, deleted ? '2026-07-02T00:00:00.000Z' : null]
  );
}

function goalRow(id: string): { current_value: number; value_baseline: number; synced: number } {
  return getDb().getFirstSync<{ current_value: number; value_baseline: number; synced: number }>(
    `SELECT current_value, value_baseline, synced FROM goals WHERE id = ?`,
    [id]
  )!;
}

beforeEach(() => {
  __resetAllDatabases();
  applyUpTo(V);
  insertUser();
});

describe('migration019 — ilerlemenin baseline + girdiler olarak ayrıştırılması', () => {
  it('GÖRÜNEN DEĞERİ DEĞİŞTİRMEZ: girdisi olmayan eski hedefte değerin tamamı baseline olur', () => {
    insertGoal('g1', 40);

    applyV19();

    // 40 = 40 (baseline) + 0 (girdi yok) → kullanıcı hiçbir fark görmez.
    expect(goalRow('g1').current_value).toBe(40);
    expect(goalRow('g1').value_baseline).toBe(40);
  });

  it('girdileri olan hedefte baseline yalnız girdilerle AÇIKLANAMAYAN farkı taşır', () => {
    // 40'ın 15'i girdilerden geliyor (ör. bağlı alışkanlık katkıları), 25'i
    // elle düzeltmeden ya da girdi kaydı tutulmayan eski sürümlerden.
    insertGoal('g1', 40);
    insertEntry('g1', 10);
    insertEntry('g1', 5);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(25);
    expect(goalRow('g1').current_value).toBe(40); // değişmedi
  });

  it('tamamı girdilerden gelen hedefte baseline 0 olur', () => {
    insertGoal('g1', 15);
    insertEntry('g1', 10);
    insertEntry('g1', 5);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(0);
    expect(goalRow('g1').current_value).toBe(15);
  });

  it('SİLİNMİŞ girdiler toplama katılmaz (yeniden hesapla aynı kural)', () => {
    // Silinmiş girdi sayılsaydı baseline eksik hesaplanır ve bir sonraki yeniden
    // hesapta kullanıcının değeri düşerdi.
    insertGoal('g1', 30);
    insertEntry('g1', 10);
    insertEntry('g1', 99, true); // soft-delete

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(20);
    expect(goalRow('g1').current_value).toBe(30);
  });

  it('negatif düzeltme girdileri de doğru hesaba katılır', () => {
    insertGoal('g1', 8);
    insertEntry('g1', 10);
    insertEntry('g1', -2);

    applyV19();

    expect(goalRow('g1').value_baseline).toBe(0);
    expect(goalRow('g1').current_value).toBe(8);
  });

  it('yeni kolonun buluta çıkması için hedefler yeniden gönderilmeyi bekler', () => {
    insertGoal('g1', 40); // synced=1 olarak eklendi

    applyV19();

    expect(goalRow('g1').synced).toBe(0);
  });

  it('hiç hedef yokken sorunsuz çalışır', () => {
    expect(() => applyV19()).not.toThrow();
  });
});
