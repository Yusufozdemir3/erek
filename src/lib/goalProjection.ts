// Sayısal hedefin girdi geçmişinden türetilen tempo + projeksiyonları — saf,
// deterministik (now/today paramlı) fonksiyon. useGoalStats bunu çağırır; ayrı
// tutulması test edilebilir kılar (timerLogic.ts ile aynı gerekçe).
//
// TASARIM KARARLARI (kullanıcının bildirdiği tutarsızlıkları önlemek için):
//  • avgDaily = SON 7 GÜNÜN günlük ortalaması (last7Total/pencere) — "Son 7 gün"
//    kartıyla tutarlı. Bu hafta hiç girdi yoksa son 30 güne düşer.
//  • PENCERE, hedefin GERÇEKTEN yaşadığı gün sayısıyla SINIRLANIR (startDate'ten
//    bugüne, en fazla 7/30). Sabit 7'ye bölmek, bugün açılıp bugün 3 girdi
//    eklenen bir hedefte "3/7≈0.4 günlük hız" gibi saçma bir küçültme üretiyordu
//    (henüz yaşanmamış 6 günü de paydaya katıyordu) — kullanıcı bunu bizzat
//    yakaladı. Artık startDate açık (goals.start_date, migration015); yoksa
//    (eski hedef) en eski girdinin tarihine düşülür.
//  • behindAmount = hedef − (mevcut + avgDaily × kalanGün) → "bu hızla son
//    tarihte hedefin ne kadar ALTINDA kalırsın". Böylece bant ("bu hızla
//    kaçırırsın") ile aynı modeli kullanır; ESKİ hata olan "ilk girdiden
//    doğrusal plan" (mevcut ilerlemeyi yok sayıp saçma 'önde' üreten) kaldırıldı.

import { diffDays, toYmd } from './helpers';

export interface GoalEntryLike {
  amount: number;
  updated_at: string; // ISO; yalnız gün kısmı kullanılır
}

export interface ProjectionInput {
  entries: GoalEntryLike[]; // goalEntryRepo sırası: en yeniden en eskiye
  target: number | null;
  current: number;
  remaining: number | null; // hedef − mevcut (numeric); yoksa null
  daysLeft: number | null; // son tarihe kalan gün (negatifse geçmiş)
  completed: boolean;
  today: string; // "YYYY-MM-DD"
  startDate?: string | null; // goals.start_date; yoksa en eski girdinin tarihine düşülür
}

export interface Projection {
  avgDaily: number | null;
  daysElapsed: number | null; // ilk girdiden bugüne
  last7Total: number | null;
  projectedFinishDate: string | null; // "bu hızla" bitiş günü
  projectedAtDeadline: number | null; // "bu hızla" son tarihteki değer
  behindAmount: number | null; // >0 son tarihte açık, <0 fazla
  dailyPercent: number | null; // günlük ortalamanın hedefe oranı
}

const EMPTY: Projection = {
  avgDaily: null,
  daysElapsed: null,
  last7Total: null,
  projectedFinishDate: null,
  projectedAtDeadline: null,
  behindAmount: null,
  dailyPercent: null,
};

export function goalProjection(input: ProjectionInput): Projection {
  const { entries, target, current, remaining, daysLeft, completed, today, startDate } = input;
  if (entries.length === 0) return EMPTY;

  const dayOf = (iso: string) => iso.slice(0, 10);
  const firstEntryDay = dayOf(entries[entries.length - 1].updated_at);
  // startDate açıkça verilmişse ONU baz al (yeni hedefler); yoksa (eski hedef,
  // migration'dan önce oluşmuş) en eski girdinin tarihine düş.
  const zeroDay = startDate ?? firstEntryDay;
  const daysElapsed = Math.max(0, diffDays(zeroDay, today));

  const shiftDay = (days: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toYmd(d);
  };
  const sumSince = (sinceYmd: string) =>
    entries.filter((e) => dayOf(e.updated_at) >= sinceYmd).reduce((s, e) => s + e.amount, 0);

  const last7Total = sumSince(shiftDay(-6));
  const last30Total = sumSince(shiftDay(-29));
  // Pencere gerçek yaşanan gün sayısıyla sınırlı (+1: bugün de dahil) — hedef
  // henüz 7/30 gün yaşamadıysa sabit 7/30'a bölmek hızı yapay olarak küçültür.
  const window7 = Math.min(7, daysElapsed + 1);
  const window30 = Math.min(30, daysElapsed + 1);
  const avgDaily = last7Total > 0 ? last7Total / window7 : last30Total > 0 ? last30Total / window30 : null;

  let projectedFinishDate: string | null = null;
  let projectedAtDeadline: number | null = null;
  let behindAmount: number | null = null;
  let dailyPercent: number | null = null;

  if (avgDaily != null) {
    dailyPercent = target != null && target > 0 ? avgDaily / target : null;
    if (!completed && remaining != null && remaining > 0) {
      projectedFinishDate = shiftDay(Math.ceil(remaining / avgDaily));
      if (daysLeft != null && daysLeft >= 0 && target != null) {
        projectedAtDeadline = current + avgDaily * daysLeft;
        behindAmount = target - projectedAtDeadline;
      }
    }
  }

  return {
    avgDaily,
    daysElapsed,
    last7Total,
    projectedFinishDate,
    projectedAtDeadline,
    behindAmount,
    dailyPercent,
  };
}
