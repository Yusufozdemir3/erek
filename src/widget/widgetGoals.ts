// Which goals the Goals widget shows, and how far along each is. Pure: the
// snapshot builder (widgetData.ts) feeds it from the repos.
//
// Only OPEN goals: a finished goal is celebrated in the app, it doesn't need
// a place on the home screen. Soonest deadline first (no deadline last), then
// the most progressed — what's closest to done or closest to due leads.

export const MAX_WIDGET_GOALS = 5;

export interface GoalInput {
  id: string;
  title: string;
  deadline: string | null; // "YYYY-MM-DD"
  completed: boolean;
  ratio: number; // 0-1 progress (numeric: current/target; milestone: reached/total)
}

export interface GoalPick {
  id: string;
  title: string;
  percent: number;
}

export function pickGoals(goals: GoalInput[], max: number = MAX_WIDGET_GOALS): GoalPick[] {
  return goals
    .filter((g) => !g.completed)
    .sort((a, b) => {
      if (a.deadline !== b.deadline) {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline < b.deadline ? -1 : 1;
      }
      return b.ratio - a.ratio || a.title.localeCompare(b.title);
    })
    .slice(0, max)
    .map((g) => ({
      id: g.id,
      title: g.title,
      percent: Math.round(Math.max(0, Math.min(1, Number.isFinite(g.ratio) ? g.ratio : 0)) * 100),
    }));
}
