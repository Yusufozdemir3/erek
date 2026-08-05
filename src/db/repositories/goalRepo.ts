// Hedef (Goal) repository.
// İki tip: 'numeric' (50/100 km gibi ilerleme) ve 'milestone' (adımlara bölünebilir,
// görev/alt görev mantığıyla aynı). Her iki tipte de artık bir deadline olabilir.

import { getDb } from '../database';
import { newId, nowIso, todayDate } from '../../lib/helpers';
import { goalEntryRepo } from './goalEntryRepo';
import { reminderRepo } from './reminderRepo';
import type { Goal, GoalType } from '../../types/models';

function rowToGoal(row: any): Goal {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    goal_type: row.goal_type as GoalType,
    target_value: row.target_value,
    current_value: row.current_value,
    unit: row.unit,
    deadline: row.deadline,
    completed_at: row.completed_at,
    remind_at: row.remind_at,
    start_date: row.start_date,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    synced: row.synced,
    value_baseline: row.value_baseline ?? 0,
  };
}

// current_value'nun girdilerden TÜRETİLDİĞİ tek nokta (bkz. migration019):
//   current_value = value_baseline + aktif girdilerin toplamı, 0 tabanlı.
// Girdiler toplamsal ve ayrı ayrı senkronlandığı için iki cihazın katkısı
// çakışmadan birleşir; baseline yalnız elle düzeltmeleri ve eski birikimi taşır.
//
// 0 TABANI: tek cihazda addProgress zaten tabanı uyguluyor, ama iki cihaz aynı
// anda eksiye çeken düzeltme girerse toplam negatife düşebilir — okurken
// kırpıyoruz ki "-5 km" gibi anlamsız bir değer hiç ortaya çıkmasın.
//
// bumpSync: değer bir KULLANICI EYLEMİ sonucu değiştiyse (addProgress, elle
// düzenleme) satır yeniden gönderilmeli. Senkronun pull sonrası yeniden hesabında
// ise FALSE geçilir — aksi halde her tur, hiçbir şey değişmese bile tüm hedefleri
// yeniden push eden bir gel-git doğardı.
function recompute(id: string, bumpSync: boolean): void {
  const db = getDb();
  const sums = bumpSync ? ', updated_at = ?, synced = 0' : '';
  const vals = bumpSync ? [nowIso(), id] : [id];
  db.runSync(
    `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
       SELECT SUM(amount) FROM goal_entries
        WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
     ), 0))${sums} WHERE id = ?`,
    vals
  );
}

export interface CreateGoalInput {
  user_id: string;
  title: string;
  goal_type: GoalType;
  target_value?: number | null;
  unit?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
  start_date?: string | null; // verilmezse bugün (tempo hesabının sıfır günü)
}

export const goalRepo = {
  create(input: CreateGoalInput): Goal {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    db.runSync(
      `INSERT INTO goals
       (id, user_id, title, goal_type, target_value, current_value, unit, deadline, remind_at, start_date, updated_at, deleted_at, synced)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, NULL, 0)`,
      [id, input.user_id, input.title, input.goal_type,
       input.target_value ?? null, input.unit ?? null, input.deadline ?? null,
       input.remind_at ?? null, input.start_date ?? todayDate(), now]
    );
    return this.getById(id)!;
  },

  getById(id: string): Goal | null {
    const db = getDb();
    const row = db.getFirstSync<any>(
      `SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL`, [id]
    );
    return row ? rowToGoal(row) : null;
  },

  listByUser(userId: string): Goal[] {
    const db = getDb();
    const rows = db.getAllSync<any>(
      `SELECT * FROM goals WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [userId]
    );
    return rows.map(rowToGoal);
  },

  // Hedefin tanımını günceller (başlık, hedef değeri, birim, son tarih, mevcut değer).
  // goal_type değiştirilmez — tip değişimi alanları tutarsız bırakır.
  // current_value verilirse yalnızca 0 tabanına sıkıştırılır; ÜST sınır YOKTUR
  // (bkz. addProgress: hedef bir sınır değil eşiktir). Eskiden burada da tavan
  // vardı ve hedefi düşürmek mevcut ilerlemeyi sessizce kesiyordu (100 hedefli,
  // 50 birikmiş bir hedefi 10'a çekmek 50'yi 10 yapıyordu — kullanıcının
  // gerçekten yaptığı iş kayboluyordu).
  update(
    id: string,
    fields: Partial<{
      title: string;
      target_value: number | null;
      unit: string | null;
      deadline: string | null;
      remind_at: string | null;
      start_date: string | null;
      current_value: number;
      // "Mevcut değer" elle değiştirilirken bu fark İLERLEME GEÇMİŞİNE de yazılsın mı
      // (GoalForm'daki onay kutusu). false/verilmezse sessiz düzeltmedir.
      log_manual_change: boolean;
    }>
  ): void {
    const db = getDb();
    const sets: string[] = [];
    const vals: any[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); vals.push(fields.title); }
    if (fields.target_value !== undefined) { sets.push('target_value = ?'); vals.push(fields.target_value); }
    if (fields.unit !== undefined) { sets.push('unit = ?'); vals.push(fields.unit); }
    if (fields.deadline !== undefined) { sets.push('deadline = ?'); vals.push(fields.deadline); }
    if (fields.remind_at !== undefined) { sets.push('remind_at = ?'); vals.push(fields.remind_at); }
    if (fields.start_date !== undefined) { sets.push('start_date = ?'); vals.push(fields.start_date); }
    // "Mevcut değer"i ELLE değiştirmenin İKİ yolu var ve ikisi de current_value'yu
    // DOĞRUDAN yazamaz — o değer artık girdilerden türetiliyor (bkz. migration019),
    // doğrudan yazılan sayı bir sonraki yeniden hesapta silinirdi:
    //
    //   log_manual_change=false (varsayılan, SESSİZ DÜZELTME): fark BASELINE'a
    //     yazılır, girdi geçmişine hiçbir şey eklenmez. Elle düzeltme bir günün
    //     emeği değildir ve tempoyu şişirmemeli.
    //   log_manual_change=true: fark bir GİRDİ olarak yazılır, baseline'a
    //     dokunulmaz — kullanıcı bunu bilerek ilerleme sayıyor.
    //
    // İkisi birlikte YAPILMAZ: bu kural eskiden ekranda (app/goal/[id].tsx)
    // duruyordu ve baseline'ı yazdıktan SONRA ayrıca girdi ekliyordu; toplam bir
    // anda `requested + fark` oluyor ama current_value `requested`te kalıyordu.
    // Değer, kullanıcı hiçbir şey yapmadan, bir sonraki senkron turunda sıçrardı.
    // Kural artık burada — tek yerde, iki yol da aynı değişmezi korur.
    // Negatif olmasın; üst sınır yok (bkz. yukarıdaki not).
    const requested = fields.current_value !== undefined ? Math.max(0, fields.current_value) : null;
    if (sets.length === 0 && requested === null) return;
    const before = requested !== null ? this.getById(id)?.current_value ?? 0 : 0;
    if (sets.length > 0) {
      sets.push('updated_at = ?'); vals.push(nowIso());
      sets.push('synced = 0');
      vals.push(id);
      db.runSync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    if (requested !== null) {
      const delta = requested - before;
      if (fields.log_manual_change) {
        if (delta !== 0) goalEntryRepo.create(id, delta);
      } else {
        db.runSync(
          `UPDATE goals SET value_baseline = ? - COALESCE((
             SELECT SUM(amount) FROM goal_entries
              WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
           ), 0) WHERE id = ?`,
          [requested, id]
        );
      }
      recompute(id, true);
    }
  },

  // Sayısal hedefte ilerlemeyi DELTA olarak değiştirir (örn. +5 km, -1 düzeltme).
  //
  // TAVAN YOK (2026-08-03 kararı). current_value artık dürüst bir SAYAÇ'tır:
  // ne kadar yapıldıysa onu tutar, target_value'yu aşabilir. Hedef bir SINIR
  // değil bir EŞİK'tir ve yalnızca GÖSTERİMDE anlam taşır — progressRatio zaten
  // Math.min(1, …) ile oranı kırpar, useGoalStats.remaining Math.max(0, …) ile
  // kalanı, milestoneViews eşik oranlarını. Yani "%120 dolu bar" gibi bir şey
  // ortaya çıkmaz; yalnızca metinde dürüstçe "120 / 100 km" yazar.
  //
  // NEDEN KALDIRILDI — kırpma iki ayrı veri kaybı üretiyordu:
  //   1) current_value hedefi aşmışken (zamanlayıcı bunu üretebiliyordu) "+1 dk"
  //      eklemek `next = target` dediği için ilerlemeyi GERİ ÇEKİYORDU:
  //      current=6000, target=3600, +60 → applied = -2400 (40 dakika silindi)
  //      ve girdi geçmişine hiç yaşanmamış bir -40:00 kaydı düşüyordu.
  //   2) Hedef DOLUYKEN bağlı alışkanlığı işaretle→geri al döngüsü asimetrikti:
  //      +1 kırpılıp yutuluyor (applied=0), -1 ise uygulanıyordu → her döngüde
  //      hedeften 1 birim sessizce eksiliyordu (bkz. habitRepo.bumpGoalIfLinked'in
  //      "+1/-1 simetriktir" varsayımı). Tavan kalkınca ikisi de tam uygulanır.
  // Tek kalan sınır 0 tabanı: negatif ilerleme anlamsız.
  //
  // Yalnızca 'numeric' hedeflerde anlamlı: 'milestone' hedefte current_value
  // kullanılmadığından sessizce yok sayılır (bağlı alışkanlık geçişi de buraya
  // düşer; milestone hedefe bağlansa bile sayaç bozulmaz).
  // Dönüş: GERÇEKTEN uygulanan fark — yalnız 0 tabanı istenen delta'yı kısabilir
  // (ör. current=2 iken -5 istenirse gerçek fark -2'dir). Kayda istenen değil
  // gerçekleşen fark düşer ki geçmiş ve ondan hesaplanan tempo/projeksiyon
  // current_value ile tutarlı kalsın. Fark 0 ise hiçbir şey yazılmaz.
  //
  // Girdi kaydı BİLEREK burada: eskiden her çağıranın ayrıca goalEntryRepo.create
  // çağırması gerekiyordu ve bağlı alışkanlık katkıları (habitRepo) bunu ATLIYORDU
  // → hedefin geçmişinde görünmüyor, tempo/projeksiyon yalnız elle "Ekle"lenenden
  // hesaplanıyordu. Tek yerde toplanınca bir daha unutulamaz.
  //
  // NOT: `update` ile "Mevcut değer"i ELLE set etmek hâlâ girdi yazmaz — o bir
  // ilerleme değil DÜZELTME'dir (bir günün emeği gibi sayılıp tempoyu şişirmemeli).
  //
  // ZAMANLAYICI DA BURAYI KULLANIR: eskiden ayrı bir addTimeProgress vardı, tek
  // farkı tavanı uygulamamasıydı. Tavan kalkınca ikisi birebir aynı fonksiyon
  // oldu ve ayrı tutmak, aynı alan üzerinde FARKLI invariant varsayan iki yazma
  // yolu demekti — yukarıdaki (1) numaralı hatanın kök nedeni tam olarak buydu.
  addProgress(id: string, amount: number): number {
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'numeric') return 0;
    const next = Math.max(0, goal.current_value + amount);
    const applied = next - goal.current_value;
    if (applied === 0) return 0;
    // ÖNCE girdi, SONRA yeniden hesap: current_value artık girdilerden türetiliyor
    // (bkz. migration019 + recompute). Doğrudan yazmak, senkron pull'undan sonraki
    // yeniden hesapla çelişirdi — ve zaten aynı sonucu verir: baseline sabit
    // kaldığı için toplam tam olarak `next` çıkar.
    goalEntryRepo.create(id, applied);
    recompute(id, true);
    return applied;
  },

  // 0-1 arası ilerleme oranı. UI yüzde göstergesi için.
  progressRatio(goal: Goal): number {
    if (goal.goal_type === 'numeric' && goal.target_value && goal.target_value > 0) {
      return Math.min(1, goal.current_value / goal.target_value);
    }
    return 0;
  },

  // Bir hedefin tamamlanmış sayılıp sayılmadığı — TİPE göre farklı kaynaktan:
  // 'numeric' oran/hedeften türer (ayrı bir bayrak tutulmaz); 'milestone' elle
  // ya da tüm adımlar tamamlanınca otomatik işaretlenen completed_at'ten okunur.
  isCompleted(goal: Goal): boolean {
    return goal.goal_type === 'numeric' ? this.progressRatio(goal) >= 1 : goal.completed_at != null;
  },

  // Yalnızca 'milestone' hedeflerde anlamlı (elle işaretleme ya da tüm adımlar
  // tamamlanınca otomatik çağrılır — bkz. app/goal/[id].tsx). 'numeric' hedefte
  // sessizce yok sayılır: tamamlanma zaten current_value>=target_value'dan gelir.
  setCompleted(id: string, completed: boolean): void {
    const db = getDb();
    const goal = this.getById(id);
    if (!goal || goal.goal_type !== 'milestone') return;
    db.runSync(
      `UPDATE goals SET completed_at = ?, updated_at = ?, synced = 0 WHERE id = ?`,
      [completed ? nowIso() : null, nowIso(), id]
    );
  },

  // TÜM hedeflerin current_value'sunu girdilerden yeniden türetir.
  // Senkron pull'u bittikten sonra çağrılır (bkz. syncEngine.runSync): uzaktan
  // gelen girdiler ve/veya baseline yereldeki toplamı değiştirmiş olabilir ve
  // uzaktan gelen current_value'nun kendisi (son-yazan-kazanır ile taşınan eski
  // önbellek) diğer cihazın katkısını GÖRMEZ — kaybolan ilerlemenin kaynağı
  // tam olarak buydu (bkz. migration019).
  //
  // synced'e DOKUNMAZ: bu bir kullanıcı eylemi değil, zaten senkronlanmış
  // veriden yapılan yeniden hesap. Aksi halde her tur tüm hedefleri yeniden
  // push eden sonu gelmez bir gel-git olurdu.
  recomputeAllFromEntries(): void {
    const db = getDb();
    db.runSync(
      `UPDATE goals SET current_value = MAX(0, value_baseline + COALESCE((
         SELECT SUM(amount) FROM goal_entries
          WHERE goal_entries.goal_id = goals.id AND goal_entries.deleted_at IS NULL
       ), 0))`
    );
  },

  // Hedefe ait hatırlatma satırları da burada temizlenir (gerekçe: habitRepo.softDelete).
  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.runSync(`UPDATE goals SET deleted_at = ?, updated_at = ?, synced = 0 WHERE id = ?`, [now, now, id]);
    reminderRepo.deleteAllForEntity('goal', id);
  },
};
