// Streak badges: the stats screen shows all of them (earned or locked); lists
// show the highest earned one in place of the flame.

export interface Milestone {
  days: number;
  emoji: string;
  labelKey: string; // i18n key
}

export const STREAK_MILESTONES: Milestone[] = [
  { days: 7, emoji: '🥉', labelKey: 'milestone.week' },
  { days: 30, emoji: '🥈', labelKey: 'milestone.month' },
  { days: 100, emoji: '🥇', labelKey: 'milestone.hundredDays' },
  { days: 365, emoji: '💎', labelKey: 'milestone.year' },
];

export function highestMilestone(streak: number): Milestone | null {
  let best: Milestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}
