// Streak milestones and badges.
// Once a habit's streak reaches a threshold, that badge is considered "earned."
// The stats screen showcases all badges (earned/locked); in lists, the
// highest earned medal is shown in place of the flame (a sense of gradual
// progress: 🔥 → 🥉 → 🥈 → 🥇 → 💎).

export interface Milestone {
  days: number;
  emoji: string;
  labelKey: string; // i18n key — the caller translates it via t(labelKey)
}

export const STREAK_MILESTONES: Milestone[] = [
  { days: 7, emoji: '🥉', labelKey: 'milestone.week' },
  { days: 30, emoji: '🥈', labelKey: 'milestone.month' },
  { days: 100, emoji: '🥇', labelKey: 'milestone.hundredDays' },
  { days: 365, emoji: '💎', labelKey: 'milestone.year' },
];

// The HIGHEST milestone reached with the given streak; null if none.
export function highestMilestone(streak: number): Milestone | null {
  let best: Milestone | null = null;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}
