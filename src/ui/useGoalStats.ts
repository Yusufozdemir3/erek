// Hedef istatistik ekranının veri yükleme mantığı: ilerleme, kalan miktar/adım,
// son tarihe göre gereken günlük/haftalık/aylık tempo ve bu hedefe bağlı
// alışkanlıklar. Yeni bir geçmiş tablosu GEREKTİRMEZ — GoalEditModal'daki "anlık
// durum" şeridiyle aynı kaynaklardan (goal.current_value/target_value/deadline)
// türetilir, burada yalnızca daha zengin ve ayrı bir ekranda gösterilir (bkz.
// useHabitStats ile aynı desen).
//
// Ekran artık sekmeli (Genel/İstatistik/Adımlar/Düzenle) tek bir kalıcı
// bileşen olduğundan (eskiden ayrı bir modal her açılışta unmount oluyordu),
// milestone/goal mutasyonlarından sonra otomatik yeniden odaklanma OLMAZ —
// çağıran taraf her mutasyondan sonra döndürülen `reload`'u elle çağırmalı.

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
  overdueDays: number | null; // yalnız isOverdue iken dolu (pozitif)
  // Yalnız 'numeric': hedefe son tarihte yetişmek için gereken tempo.
  // Son tarih yoksa, tamamlandıysa ya da son tarih geçtiyse üçü de null.
  dailyPace: number | null;
  weeklyPace: number | null;
  monthlyPace: number | null;
  // Adımlar artık HER İKİ tipte de opsiyonel olabilir ('numeric' hedefe de
  // checklist eklenebilir) — bu alanlar milestonesTotal>0 iken doludur, tipe
  // bakılmaksızın.
  milestones: GoalMilestone[];
  milestonesDone: number;
  milestonesTotal: number;
  milestonesRemaining: number;
  milestonePaceDays: number | null; // ortalama: kalan her adım için kaç gün var
  milestoneWeeklyPace: number | null; // haftada tamamlanması gereken adım sayısı
  // Bu hedefe bağlı (goal_id ile işaretlenmiş) alışkanlıklar — bkz. HabitForm.linkGoal.
  linkedHabits: LinkedHabit[];
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
  monthlyPace: null,
  milestones: [] as GoalMilestone[],
  milestonesDone: 0,
  milestonesTotal: 0,
  milestonesRemaining: 0,
  milestonePaceDays: null,
  milestoneWeeklyPace: null,
  linkedHabits: [] as LinkedHabit[],
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

    // Tempo hesabı yalnız gelecekte (bugün dahil) bir son tarihi olan, henüz
    // tamamlanmamış hedefte anlamlı. "Bugün son gün" (daysLeft=0) -> kalanın
    // tamamı bugüne düşer, bölen en az 1 kabul edilir.
    const effectiveDays = daysLeft != null && daysLeft >= 0 ? Math.max(1, daysLeft) : null;
    const dailyPace =
      !completed && remaining != null && effectiveDays != null ? remaining / effectiveDays : null;
    const weeklyPace = dailyPace != null ? dailyPace * 7 : null;
    const monthlyPace = dailyPace != null ? dailyPace * 30 : null;

    // Adımlar tipten bağımsız çekilir: 'milestone' hedefte zorunlu iş akışının
    // parçası, 'numeric' hedefte tamamen opsiyonel bir checklist (tamamlanma
    // durumunu ETKİLEMEZ — bkz. goalRepo.setCompleted'in tip koruması).
    const milestones = goalMilestoneRepo.listByGoal(goal.id);
    const milestoneCounts = goalMilestoneRepo.countForGoal(goal.id);
    const milestonesDone = milestoneCounts.done;
    const milestonesTotal = milestoneCounts.total;
    const milestonesRemaining = Math.max(0, milestonesTotal - milestonesDone);
    // Tempo: adımı olan HERHANGİ bir hedefte anlamlı (yalnızca 'milestone' değil).
    const milestonePaceDays =
      !completed && milestonesRemaining > 0 && effectiveDays != null
        ? effectiveDays / milestonesRemaining
        : null;
    const milestoneWeeklyPace = milestonePaceDays != null ? 7 / milestonePaceDays : null;

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
      overdueDays,
      dailyPace,
      weeklyPace,
      monthlyPace,
      milestones,
      milestonesDone,
      milestonesTotal,
      milestonesRemaining,
      milestonePaceDays,
      milestoneWeeklyPace,
      linkedHabits,
    });
  }, [goalId]);

  useFocusEffect(reload);

  return { ...stats, reload };
}
