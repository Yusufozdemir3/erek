// ÖLÇEK TESTLERİ — bir yılı aşkın kullanan bir kullanıcının gerçek büyüklükleri.
//
// NEDEN VAR: P2/P3 turlarında iki değişiklik büyük veriye özgü davranışlar
// ekledi — Görevler ekranının sorgu sınırı (taskRepo.listForScreen) ve toplu
// alışkanlık sorgularının SQLite `IN (…)` bağlı değişken sınırını aşmaması
// (helpers.chunk, SQL_PARAM_CHUNK). İkisi de küçük veride sessizce doğru
// görünüp yalnız SINIRIN ÖTESİNDE bozulabilecek türden hatalar taşır — bu
// yüzden testler bilerek sınırı AŞAN boyutlarda çalışır.

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

    // Ekranın gerçekten çizeceği liste: 800 + 50, 2000 civarı DEĞİL — sanallaştırma
    // gerekmeden akıcı kalması gereken kısım budur.
    expect(list.length).toBe(ACTIVE + RECENT_COMPLETED);
    expect(taskRepo.countCompletedBefore(userId, '2026-06-01')).toBe(OLD_COMPLETED);

    // Sıralama korunuyor: tamamlanmamışlar üstte.
    const firstCompletedIdx = list.findIndex((t) => t.completed_at !== null);
    expect(list.slice(0, firstCompletedIdx).every((t) => t.completed_at === null)).toBe(true);

    // "Tümünü göster" (since=null) gerçekten hepsini verir.
    expect(taskRepo.listForScreen(userId, null).length).toBe(ACTIVE + OLD_COMPLETED + RECENT_COMPLETED);
  }, 30_000);
});

describe('habitRepo — SQL_PARAM_CHUNK sınırını aşan alışkanlık sayısı', () => {
  it(`${SQL_PARAM_CHUNK}'den FAZLA alışkanlıkta getDayStates hiçbirini kaybetmez/kopyalamaz`, () => {
    const COUNT = SQL_PARAM_CHUNK + 137; // sınırı bilerek aşıyor
    const habits = Array.from({ length: COUNT }, (_, i) =>
      habitRepo.create({ user_id: userId, title: `Alışkanlık ${i}` })
    );
    const today = '2026-07-01';
    // Yalnız BİR KISMINI işaretle — sonuçta hiç yer almaması gerekenleri de sına.
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
        // İşaretlenmemiş alışkanlık sonuçta hiç yer almaz (repo'nun dokümante
        // ettiği sözleşme) — parçalama bunu bozmamalı.
        expect(states[habits[i].id]).toBeUndefined();
      }
    }
  }, 30_000);

  it(`${SQL_PARAM_CHUNK}'den FAZLA alışkanlıkta completedDatesBetween parça sınırında BÖLÜNMEZ`, () => {
    const COUNT = SQL_PARAM_CHUNK + 50;
    const habits = Array.from({ length: COUNT }, (_, i) =>
      habitRepo.create({ user_id: userId, title: `A${i}` })
    );
    // Parça sınırının TAM ETRAFINDAKİ alışkanlıkları özellikle işaretle — bir
    // off-by-one hatası tam da burada bir günü yanlış parçaya düşürürdü.
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
    // İşaretlenmeyenler sonuçta yer almıyor.
    expect(out[habits[0].id]).toBeUndefined();
  }, 30_000);
});

describe('subtaskRepo.countsForTasks — SQL_PARAM_CHUNK sınırını aşan görev sayısı', () => {
  it('parçalama alt görev sayımını bozmaz', () => {
    const COUNT = SQL_PARAM_CHUNK + 80;
    const tasks = Array.from({ length: COUNT }, (_, i) =>
      taskRepo.create({ user_id: userId, title: `G${i}` })
    );
    // Parça sınırındaki görevlere alt görev ekle.
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
    expect(counts[tasks[0].id]).toBeUndefined(); // alt görevsiz görev yer almaz
  }, 30_000);
});
