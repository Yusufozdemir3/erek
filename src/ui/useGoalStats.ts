// Goal screen data: progress, the pace needed by the deadline, actual pace and
// projections, steps, linked habits and entries. The tabbed goal screen stays
// mounted, so callers must call `reload` after every change.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalEntryRepo, goalMilestoneRepo, goalRepo, habitRepo, milestoneViews as computeMilestoneViews } from '@/db';
import type { Goal, GoalEntry, GoalMilestone, MilestoneView } from '@/db';
import { todayDate } from '@/lib/helpers';
import { goalProjection } from '@/lib/goalProjection';
import { nextMilestoneStat, type NextMilestoneStat } from '@/lib/milestoneStats';

export interface LinkedHabit {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
}

export interface GoalStats {
  goal: Goal | null;
  ratio: number; // 0..1, 'numeric' only
  remaining: number | null; // 'numeric': target - current; otherwise null
  completed: boolean;
  daysLeft: number | null; // null = no deadline; negative means overdue
  isOverdue: boolean;
  overdueDays: number | null; // only populated (positive) while isOverdue
  // Numeric: the pace needed to finish by the deadline; null without an open
  // deadline or once completed.
  dailyPace: number | null;
  weeklyPace: number | null;
  // — Actual pace + projections (numeric; lib/goalProjection.ts) —
  avgDaily: number | null;
  projectedAtDeadline: number | null;
  projectedFinishDate: string | null;
  // > 0 short at the deadline, < 0 ahead.
  behindAmount: number | null;
  daysElapsed: number | null;
  last7Total: number | null;
  // Steps (either goal type).
  milestones: GoalMilestone[];
  // With an amount: a threshold filled from current_value; without: a checklist item.
  milestoneViews: MilestoneView[];
  milestonesDone: number;
  milestonesTotal: number;
  milestonesRemaining: number;
  // The step being worked on (lib/milestoneStats.ts); null if none is left.
  nextMilestone: NextMilestoneStat | null;
  linkedHabits: LinkedHabit[];
  // Newest first; current_value = baseline + these.
  entries: GoalEntry[];
  reload: () => void;
}

const EMPTY_BASE = {
  goal: null as Goal | null,
  ratio: 0,
  remaining: null,
  completed: false,
  daysLeft: null,
  isOverdue: false,
  overdueDays: null,
  dailyPace: null,
  weeklyPace: null,
  avgDaily: null,
  projectedAtDeadline: null,
  projectedFinishDate: null,
  behindAmount: null,
  daysElapsed: null,
  last7Total: null,
  milestones: [] as GoalMilestone[],
  milestoneViews: [] as MilestoneView[],
  milestonesDone: 0,
  milestonesTotal: 0,
  milestonesRemaining: 0,
  nextMilestone: null as NextMilestoneStat | null,
  linkedHabits: [] as LinkedHabit[],
  entries: [] as GoalEntry[],
};

// Pure, so a friend's shared goal (useSharedGoal) gets exactly the same numbers.
export function computeGoalStats(
  goal: Goal,
  milestones: GoalMilestone[],
  entries: GoalEntry[],
  linkedHabits: LinkedHabit[],
  today: string
): Omit<GoalStats, 'reload'> {
  const ratio = goalRepo.progressRatio(goal);
  const remaining =
    goal.goal_type === 'numeric' && goal.target_value != null
      ? Math.max(0, goal.target_value - goal.current_value)
      : null;
  const completed = goalRepo.isCompleted(goal);

  let daysLeft: number | null = null;
  if (goal.deadline) {
    const target = new Date(`${goal.deadline}T00:00:00`);
    const todayD = new Date(`${today}T00:00:00`);
    daysLeft = Math.round((target.getTime() - todayD.getTime()) / 86_400_000);
  }
  const isOverdue = daysLeft != null && daysLeft < 0;
  const overdueDays = isOverdue ? -daysLeft! : null;

  // Only for an open goal whose deadline is today or later (today = divide by 1).
  const effectiveDays = daysLeft != null && daysLeft >= 0 ? Math.max(1, daysLeft) : null;
  const dailyPace =
    !completed && remaining != null && effectiveDays != null ? remaining / effectiveDays : null;
  const weeklyPace = dailyPace != null ? dailyPace * 7 : null;

  // On a numeric goal, steps never affect completion.
  const views = computeMilestoneViews(milestones, goal.current_value);
  const milestonesDone = views.filter((v) => v.reached).length;
  const milestonesTotal = views.length;
  const milestonesRemaining = Math.max(0, milestonesTotal - milestonesDone);
  const nextMilestone = nextMilestoneStat(views, goal.current_value, today);

  const projection =
    goal.goal_type === 'numeric'
      ? goalProjection({
          entries,
          target: goal.target_value,
          current: goal.current_value,
          remaining,
          daysLeft,
          completed,
          today,
          startDate: goal.start_date,
        })
      : {
          avgDaily: null,
          daysElapsed: null,
          last7Total: null,
          projectedAtDeadline: null,
          projectedFinishDate: null,
          behindAmount: null,
        };

  return {
    goal,
    ratio,
    remaining,
    completed,
    daysLeft,
    isOverdue,
    overdueDays,
    dailyPace,
    weeklyPace,
    avgDaily: projection.avgDaily,
    projectedAtDeadline: projection.projectedAtDeadline,
    projectedFinishDate: projection.projectedFinishDate,
    behindAmount: projection.behindAmount,
    daysElapsed: projection.daysElapsed,
    last7Total: projection.last7Total,
    milestones,
    milestoneViews: views,
    milestonesDone,
    milestonesTotal,
    milestonesRemaining,
    nextMilestone,
    linkedHabits,
    entries,
  };
}

export const EMPTY_GOAL_STATS: Omit<GoalStats, 'reload'> = EMPTY_BASE;

export function useGoalStats(goalId: string): GoalStats {
  const [stats, setStats] = useState<Omit<GoalStats, 'reload'>>(EMPTY_BASE);

  const reload = useCallback(() => {
    const goal = goalRepo.getById(goalId);
    if (!goal) {
      setStats(EMPTY_BASE);
      return;
    }
    const linkedHabits: LinkedHabit[] = habitRepo
      .listByUser(goal.user_id)
      .filter((h) => h.goal_id === goal.id)
      .map((h) => ({ id: h.id, title: h.title, icon: h.icon, color: h.color }));
    setStats(
      computeGoalStats(
        goal,
        goalMilestoneRepo.listByGoal(goal.id),
        goalEntryRepo.listByGoal(goal.id),
        linkedHabits,
        todayDate()
      )
    );
  }, [goalId]);

  useFocusEffect(reload);

  return { ...stats, reload };
}
