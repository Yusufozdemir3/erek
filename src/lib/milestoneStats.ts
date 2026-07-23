// SIRADAKİ ADIM istatistiği — saf fonksiyon (goalProjection/habitSeries ile aynı
// gerekçe: React'siz, test edilebilir, zaman parametreli).
//
// MODEL (kullanıcı kararı 2026-07-23): hedef istatistiklerinin altında adımların
// TOPLU özeti (kalan adım / gün başına adım / haftada adım) DEĞİL, yalnızca
// SIRADAKİ adımın durumu gösterilir. Kullanıcının o an sorduğu soru "toplamda
// kaç adım kaldı" değil, "şimdi neye çalışıyorum ve yetişiyor muyum".
//
// Sıradaki adım = listede (position sırası) HENÜZ ULAŞILMAMIŞ ilk adım.
// Miktarlı adımlarda "ulaşıldı" current_value'dan türer (kümülatif eşik),
// miktarsız (checklist) adımlarda elle işaretlemeden gelir — bkz. milestoneViews.

import { diffDays } from './helpers';
import type { MilestoneView } from '@/db';

export interface NextMilestoneStat {
  title: string;
  // — Miktarlı adımlarda dolu; checklist adımında null —
  targetAmount: number | null; // adımın hedefi
  remainingAmount: number | null; // o hedefe ne kadar kaldı (0'ın altına inmez)
  ratio: number; // 0..1 — adımın kendi doluluk oranı ("yüzde kaç"tayız)
  // — Son tarihi olan adımlarda dolu —
  dueDate: string | null;
  daysLeft: number | null; // negatifse gecikmiş
  isOverdue: boolean;
  overdueDays: number | null; // yalnız isOverdue iken pozitif dolu
}

// Ulaşılmamış ilk adımın istatistiği; hiç adım yoksa ya da hepsi tamamlandıysa null.
export function nextMilestoneStat(
  views: MilestoneView[],
  currentValue: number,
  today: string
): NextMilestoneStat | null {
  const next = views.find((v) => !v.reached);
  if (!next) return null;

  const m = next.milestone;
  const targetAmount = m.amount != null && m.amount > 0 ? m.amount : null;
  const remainingAmount = targetAmount != null ? Math.max(0, targetAmount - currentValue) : null;

  const daysLeft = m.due_date ? diffDays(today, m.due_date) : null;
  const isOverdue = daysLeft != null && daysLeft < 0;

  return {
    title: m.title,
    targetAmount,
    remainingAmount,
    ratio: next.ratio,
    dueDate: m.due_date,
    daysLeft,
    isOverdue,
    overdueDays: isOverdue ? -daysLeft! : null,
  };
}
