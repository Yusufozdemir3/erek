// Streak (seri) kilometre taşları ve rozetleri.
// Bir alışkanlığın serisi bir eşiğe ulaşınca o rozet "kazanılmış" sayılır.
// İstatistik ekranı tüm rozetleri (kazanılan/kilitli) vitrinler; listelerde ise
// en yüksek kazanılan madalya alevin yerine gösterilir (aşamalı ilerleme hissi:
// 🔥 → 🥉 → 🥈 → 🥇 → 💎).

export interface Milestone {
  days: number;
  emoji: string;
  label: string;
}

export const STREAK_MILESTONES: Milestone[] = [
  { days: 7, emoji: '🥉', label: '1 hafta' },
  { days: 30, emoji: '🥈', label: '1 ay' },
  { days: 100, emoji: '🥇', label: '100 gün' },
  { days: 365, emoji: '💎', label: '1 yıl' },
];

// Verilen seriyle ulaşılmış EN YÜKSEK kilometre taşı; hiçbiri değilse null.
export function highestMilestone(streak: number): Milestone | null {
  let best: Milestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}
