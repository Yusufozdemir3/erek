// Streak (seri) kilometre taşları ve rozetleri.
// Bir alışkanlığın serisi bir eşiğe ulaşınca o rozet "kazanılmış" sayılır.
// İstatistik ekranı tüm rozetleri (kazanılan/kilitli) vitrinler; listelerde ise
// en yüksek kazanılan madalya alevin yerine gösterilir (aşamalı ilerleme hissi:
// 🔥 → 🥉 → 🥈 → 🥇 → 💎).

export interface Milestone {
  days: number;
  emoji: string;
  labelKey: string; // i18n anahtarı — çağıran t(labelKey) ile çevirir
}

export const STREAK_MILESTONES: Milestone[] = [
  { days: 7, emoji: '🥉', labelKey: 'milestone.week' },
  { days: 30, emoji: '🥈', labelKey: 'milestone.month' },
  { days: 100, emoji: '🥇', labelKey: 'milestone.hundredDays' },
  { days: 365, emoji: '💎', labelKey: 'milestone.year' },
];

// Verilen seriyle ulaşılmış EN YÜKSEK kilometre taşı; hiçbiri değilse null.
export function highestMilestone(streak: number): Milestone | null {
  let best: Milestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}
