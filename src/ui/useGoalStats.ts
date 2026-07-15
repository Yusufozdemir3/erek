// Hedef istatistik ekranının veri yükleme mantığı: ilerleme, kalan miktar/adım,
// son tarihe göre gereken günlük/haftalık tempo ve bu hedefe bağlı alışkanlıklar.
// Yeni bir geçmiş tablosu GEREKTİRMEZ — GoalEditModal'daki "anlık durum" şeridiyle
// aynı kaynaklardan (goal.current_value/target_value/deadline) türetilir, burada
// yalnızca daha zengin ve ayrı bir ekranda gösterilir (bkz. useHabitStats ile aynı desen).

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { goalMilestoneRepo, goalRepo, habitRepo } from '@/db';
import type { Goal, GoalMilestone } from '@/db';
import { todayDate } from '@/lib/helpers';

export interface LinkedHabit {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
}

export interface GoalStats {
  goal: Goal | null;
  ratio: number; // 0..1, yalnızca 'numeric'
  remaining: number | null; // 'numeric': hedef - mevcut; değilse null
  completed: boolean;
  daysLeft: number | null; // null = son tarih yok; negatifse gecikmiş
  isOverdue: boolean;
  // Yalnız 'numeric': hedefe son tarihte yetişmek için günde/haftada gereken miktar.
  // Son tarih yoksa, tamamlandıysa ya da son tarih geçtiyse null.
  dailyPace: number | null;
  weeklyPace: number | null;
  // Yalnız 'milestone':
  milestones: GoalMilestone[];
  milestonesDone: number;
  milestonesTotal: number;
  milestonesRemaining: number;
  milestonePaceDays: number | null; // ortalama: kalan her adım için kaç gün var
  // Bu hedefe bağlı (goal_id ile işaretlenmiş) alışkanlıklar — bkz. HabitForm.linkGoal.
  linkedHabits: LinkedHabit[];
}

const EMPTY: GoalStats = {
  goal: null,
  ratio: 0,
  remaining: null,
  completed: false,
  daysLeft: null,
  isOverdue: false,
  dailyPace: null,
  weeklyPace: null,
  milestones: [],
  milestonesDone: 0,
  milestonesTotal: 0,
  milestonesRemaining: 0,
  milestonePaceDays: null,
  linkedHabits: [],
};

export function useGoalStats(goalId: string): GoalStats {
  const [stats, setStats] = useState<GoalStats>(EMPTY);

  const reload = useCallback(() => {
    const goal = goalRepo.getById(goalId);
    if (!goal) {
      setStats(EMPTY);
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

    // Tempo hesabı yalnız gelecekte (bugün dahil) bir son tarihi olan, henüz
    // tamamlanmamış hedefte anlamlı. "Bugün son gün" (daysLeft=0) -> kalanın
    // tamamı bugüne düşer, bölen en az 1 kabul edilir.
    const effectiveDays = daysLeft != null && daysLeft >= 0 ? Math.max(1, daysLeft) : null;
    const dailyPace =
      !completed && remaining != null && effectiveDays != null ? remaining / effectiveDays : null;
    const weeklyPace = dailyPace != null ? dailyPace * 7 : null;

    let milestones: GoalMilestone[] = [];
    let milestonesDone = 0;
    let milestonesTotal = 0;
    let milestonePaceDays: number | null = null;
    if (goal.goal_type === 'milestone') {
      milestones = goalMilestoneRepo.listByGoal(goal.id);
      const counts = goalMilestoneRepo.countForGoal(goal.id);
      milestonesDone = counts.done;
      milestonesTotal = counts.total;
      const remainingSteps = Math.max(0, milestonesTotal - milestonesDone);
      milestonePaceDays =
        !completed && remainingSteps > 0 && effectiveDays != null
          ? effectiveDays / remainingSteps
          : null;
    }
    const milestonesRemaining = Math.max(0, milestonesTotal - milestonesDone);

    // Bu hedefe bağlı alışkanlıklar — ayrı bir sorgu yerine tüm kullanıcı
    // alışkanlıkları tek listede zaten çekiliyor (liste büyüklüğü küçük).
    const linkedHabits: LinkedHabit[] = habitRepo
      .listByUser(goal.user_id)
      .filter((h) => h.goal_id === goal.id)
      .map((h) => ({ id: h.id, title: h.title, icon: h.icon, color: h.color }));

    setStats({
      goal,
      ratio,
      remaining,
      completed,
      daysLeft,
      isOverdue,
      dailyPace,
      weeklyPace,
      milestones,
      milestonesDone,
      milestonesTotal,
      milestonesRemaining,
      milestonePaceDays,
      linkedHabits,
    });
  }, [goalId]);

  useFocusEffect(reload);

  return stats;
}
