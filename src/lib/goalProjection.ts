// Sayısal hedefin tempo + projeksiyonları — saf, deterministik (today paramlı)
// fonksiyon. useGoalStats bunu çağırır; ayrı tutulması test edilebilir kılar
// (timerLogic.ts / habitSeries.ts ile aynı gerekçe).
//
// MODEL (kullanıcı kararı 2026-07-23): hedefte BAŞLANGIÇ ve SON TARİH artık
// ZORUNLU (bkz. GoalForm — ikisi de bugünle önceden dolu gelir), o yüzden bütün
// hesaplar bu iki tarihin çizdiği eksende yapılır:
//
//   başlangıç ─────────── bugün ─────────── son tarih
//   |<-- yaşanan gün -->|<-- kalan gün -->|
//
//   • avgDaily ("günde ne kadar yapıyorum") = mevcut / yaşanan gün.
//     Kayan 7/30 günlük pencere DEĞİL: hedefin tüm ömrü boyunca gerçekleşen
//     hız. Girdi geçmişine bağlı olmadığı için miktarı geri almak (negatif
//     düzeltme) temposu sıfırlayıp kartları ekrandan silmiyor — eski davranışta
//     son 7 günün neti <= 0 olunca "Senin temponun" grubu tümüyle kayboluyordu.
//   • last7Total ("son 7 günde ne kadar yaptım") girdi geçmişinden gelir; bu
//     bilerek pencereli, çünkü sorunun kendisi pencereli.
//   • projectedFinishDate ("bu hızla hangi tarihte bitiririm") = bugün + kalan/avgDaily
//   • projectedAtDeadline ("bu hızla son tarihte miktar ne olur") = mevcut + avgDaily × kalan gün
//   • behindAmount = hedef − projectedAtDeadline (>0 açık, <0 fazla)
//
// SON TARİH GEÇTİYSE: projeksiyon "tahmin" olmaktan çıkar, GERÇEKLEŞEN olur —
// son tarihteki miktar artık mevcut değerdir, açık da kalan miktardır. Eskiden
// bu durumda ikisi de null'a düşüyordu, yani kullanıcı en geride olduğu anda
// kartlar ekrandan kayboluyordu.

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
  startDate?: string | null; // goals.start_date (zorunlu); yoksa en eski girdiye düşülür
}

export interface Projection {
  avgDaily: number | null; // günlük gerçekleşen hız (mevcut / yaşanan gün)
  daysElapsed: number | null; // başlangıçtan bugüne, bugün DAHİL
  last7Total: number | null; // son 7 günde girilen toplam
  projectedFinishDate: string | null; // "bu hızla" bitiş günü
  projectedAtDeadline: number | null; // son tarihteki miktar (geçmişse: gerçekleşen)
  behindAmount: number | null; // >0 son tarihte açık, <0 fazla
}

const EMPTY: Projection = {
  avgDaily: null,
  daysElapsed: null,
  last7Total: null,
  projectedFinishDate: null,
  projectedAtDeadline: null,
  behindAmount: null,
};

// Tahmini bitiş için üst sınır. Çok küçük bir hızda (ör. günde 0,001) matematik
// yüzlerce yıl sonrasına tarih üretiyor; uç değerde Date taşıp "NaN-NaN-NaN"
// yazdırıyordu. Bu sınırın ötesi "bu hızla bitmez" demektir — tarih gösterilmez.
const MAX_PROJECTION_DAYS = 3650; // 10 yıl

export function goalProjection(input: ProjectionInput): Projection {
  const { entries, target, current, remaining, daysLeft, completed, today, startDate } = input;

  const dayOf = (iso: string) => iso.slice(0, 10);
  // Sıfır günü: hedefin başlangıç tarihi. Eski hedeflerde (start_date eklenmeden
  // önce oluşmuş) en eski girdinin gününe düşülür; o da yoksa hesap yapılamaz.
  const firstEntryDay = entries.length > 0 ? dayOf(entries[entries.length - 1].updated_at) : null;
  const zeroDay = startDate ?? firstEntryDay;
  if (!zeroDay) return EMPTY;

  // Yaşanan gün: başlangıç günü de bugün de dahil (bugün açılan hedef = 1 gün).
  // Gelecek tarihli başlangıçta (henüz başlamamış hedef) en az 1 kabul edilir.
  const daysElapsed = Math.max(1, diffDays(zeroDay, today) + 1);

  const shiftDay = (days: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toYmd(d);
  };

  // "Son 7 günde ne kadar yaptım" — pencere hedefin yaşadığı günü aşamaz.
  const window7 = Math.min(7, daysElapsed);
  const since = shiftDay(-(window7 - 1));
  const last7Total = entries
    .filter((e) => dayOf(e.updated_at) >= since)
    .reduce((s, e) => s + e.amount, 0);

  // "Günde ne kadar yapıyorum" — hedefin ömrü boyunca gerçekleşen hız.
  const avgDaily = current > 0 ? current / daysElapsed : null;

  let projectedFinishDate: string | null = null;
  let projectedAtDeadline: number | null = null;
  let behindAmount: number | null = null;

  if (!completed && remaining != null && remaining > 0 && avgDaily != null && avgDaily > 0) {
    const daysNeeded = Math.ceil(remaining / avgDaily);
    if (daysNeeded <= MAX_PROJECTION_DAYS) projectedFinishDate = shiftDay(daysNeeded);
  }

  if (daysLeft != null && target != null) {
    // İleri projeksiyon YALNIZ hedef henüz açıkken anlamlı:
    //   • son tarih geçtiyse tahmin değil GERÇEKLEŞEN (o gün elindeki miktar),
    //   • hedef tamamlandıysa da uzatma yapılmaz — goalRepo.addProgress miktarı
    //     hedefte kırpar, "son tarihte 90 fazla yaparsın" gibi bir sayı üretmek
    //     hem yanlış hem anlamsız olurdu.
    const extrapolate = daysLeft >= 0 && !completed;
    projectedAtDeadline = extrapolate ? current + (avgDaily ?? 0) * daysLeft : current;
    behindAmount = target - projectedAtDeadline;
  }

  return {
    avgDaily,
    daysElapsed,
    last7Total,
    projectedFinishDate,
    projectedAtDeadline,
    behindAmount,
  };
}
