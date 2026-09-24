// Data loading logic for the goal stats screen: progress, remaining
// amount/steps, the daily/weekly/monthly pace needed to hit the deadline, and
// habits linked to this goal. Does NOT require a new history table — it's
// derived from the same sources as GoalEditModal's "current status" strip
// (goal.current_value/target_value/deadline), just shown here in a richer form
// on a separate screen (same pattern as useHabitStats).
//
// Since the screen is now a single persistent tabbed component
// (Overview/Stats/Steps/Edit) instead of a separate modal that used to unmount
// on every open, there's NO automatic refocus after milestone/goal mutations —
// the caller must manually call the returned `reload` after every mutation.

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
  // Numeric only: the pace needed to hit the deadline in time ("how much do I
  // need to do per day/week to finish by the set date"). Both are null if
  // there's no deadline, it's completed, or the deadline has passed.
  dailyPace: number | null;
  weeklyPace: number | null;
  // — Actual pace + projections (numeric); see lib/goalProjection.ts —
  // All computed on the start–deadline axis (both are required fields).
  // "How much am I doing per day": current / days elapsed.
  avgDaily: number | null;
  // "What will the amount be at the deadline at this rate"; the actual value if the deadline has passed.
  projectedAtDeadline: number | null;
  // "At this rate, what date will I finish" ("YYYY-MM-DD"; if within a reasonable range).
  projectedFinishDate: string | null;
  // Difference at the deadline: positive = falls short, negative = exceeds the target.
  behindAmount: number | null;
  // Days elapsed from the start date to today (inclusive).
  daysElapsed: number | null;
  // "How much did I do in the last 7 days" — from the entry history.
  last7Total: number | null;
  // Steps can now be optional on EITHER type ('numeric' goals can also have a
  // checklist) — these fields are populated whenever milestonesTotal>0, regardless of type.
  milestones: GoalMilestone[];
  // Step views: steps with an amount become cumulative threshold bars filled
  // from current_value; those without become a checklist (see goalMilestoneRepo.milestoneViews).
  milestoneViews: MilestoneView[];
  milestonesDone: number;
  milestonesTotal: number;
  milestonesRemaining: number;
  // The stats tab's step section now shows ONLY the next step instead of an
  // AGGREGATE pace (days/step, steps/week) — see lib/milestoneStats.ts.
  // null if there are no steps or all are completed.
  nextMilestone: NextMilestoneStat | null;
  // Habits linked to this goal (marked via goal_id) — see HabitForm.linkGoal.
  linkedHabits: LinkedHabit[];
  // History of free-form amount entries on the "Overview" tab (newest to
  // oldest) — a log only, NOT the source of current_value.
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

export function useGoalStats(goalId: string): GoalStats {
  const [stats, setStats] = useState<Omit<GoalStats, 'reload'>>(EMPTY_BASE);

  const reload = useCallback(() => {
    const goal = goalRepo.getById(goalId);
    if (!goal) {
      setStats(EMPTY_BASE);
      return;
    }

    const ratio = goalRepo.progressRatio(goal);
    const remaining =
      goal.goal_type === 'numeric' && goal.target_value != null
        ? Math.max(0, goal.target_value - goal.current_value)
        : null;
    const completed = goalRepo.isCompleted(goal);

    let daysLeft: number | null = null;
    if (goal.deadline) {
      const target = new Date(`${goal.deadline}T00:00:00`);
      const today = new Date(`${todayDate()}T00:00:00`);
      daysLeft = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    }
    const isOverdue = daysLeft != null && daysLeft < 0;
    const overdueDays = isOverdue ? -daysLeft! : null;

    // Pace is only meaningful for a not-yet-completed goal with a deadline in
    // the future (today included). "Today is the deadline" (daysLeft=0) -> all
    // of the remainder falls on today, the divisor is treated as at least 1.
    const effectiveDays = daysLeft != null && daysLeft >= 0 ? Math.max(1, daysLeft) : null;
    const dailyPace =
      !completed && remaining != null && effectiveDays != null ? remaining / effectiveDays : null;
    const weeklyPace = dailyPace != null ? dailyPace * 7 : null;

    // Steps are fetched regardless of type: they're a required part of the
    // workflow for a 'milestone' goal, and either a quantity-based threshold or
    // (if quantity-less) a checklist for a 'numeric' goal (does NOT AFFECT
    // completion status — see the type guard in goalRepo.setCompleted). The
    // "done" count comes from the views: threshold steps are counted from
    // current_value, checklist steps from the completed column.
    const milestones = goalMilestoneRepo.listByGoal(goal.id);
    const views = computeMilestoneViews(milestones, goal.current_value);
    const milestonesDone = views.filter((v) => v.reached).length;
    const milestonesTotal = views.length;
    const milestonesRemaining = Math.max(0, milestonesTotal - milestonesDone);
    // Next step: the single threshold the user is currently working on.
    const nextMilestone = nextMilestoneStat(views, goal.current_value, todayDate());

    // Habits linked to this goal — instead of a separate query, all of the
    // user's habits are already fetched in a single list (the list size is small).
    const linkedHabits: LinkedHabit[] = habitRepo
      .listByUser(goal.user_id)
      .filter((h) => h.goal_id === goal.id)
      .map((h) => ({ id: h.id, title: h.title, icon: h.icon, color: h.color }));

    const entries = goalEntryRepo.listByGoal(goal.id);

    // Actual pace + projections (only meaningful for numeric goals). Extracted
    // into a pure function (see lib/goalProjection.ts — design decisions + tests).
    const {
      avgDaily,
      daysElapsed,
      last7Total,
      projectedAtDeadline,
      projectedFinishDate,
      behindAmount,
    } =
      goal.goal_type === 'numeric'
        ? goalProjection({
            entries,
            target: goal.target_value,
            current: goal.current_value,
            remaining,
            daysLeft,
            completed,
            today: todayDate(),
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

    setStats({
      goal,
      ratio,
      remaining,
      completed,
      daysLeft,
      isOverdue,
      overdueDays,
      dailyPace,
      weeklyPace,
      avgDaily,
      projectedAtDeadline,
      projectedFinishDate,
      behindAmount,
      daysElapsed,
      last7Total,
      milestones,
      milestoneViews: views,
      milestonesDone,
      milestonesTotal,
      milestonesRemaining,
      nextMilestone,
      linkedHabits,
      entries,
    });
  }, [goalId]);

  useFocusEffect(reload);

  return { ...stats, reload };
}
