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
import { goalEntryRepo, goalMilestoneRepo, goalRepo, habitRepo, milestoneViews as computeMilestoneViews } from '@/db';
import type { Goal, GoalEntry, GoalMilestone, MilestoneView } from '@/db';
import { todayDate } from '@/lib/helpers';
import { goalProjection } from '@/lib/goalProjection';

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
  // — Girdi geçmişinden türetilen gerçekleşen tempo + projeksiyonlar (numeric) —
  // avgDaily: günlük ortalama ilerleme. Son 14 günde girdi varsa o pencereden,
  // yoksa ilk girdiden bugüne genel ortalamadan hesaplanır. Girdi yoksa null.
  avgDaily: number | null;
  // Bu hızla son tarihte ulaşılacak miktar (deadline gelecekte + avgDaily varken).
  projectedAtDeadline: number | null;
  // Bu hızla hedefin biteceği tahmini tarih ("YYYY-MM-DD"; avgDaily>0 iken).
  projectedFinishDate: string | null;
  // Doğrusal plana göre fark: pozitif = plana göre GERİDE, negatif = önde.
  // Plan: ilk girdi gününde 0'dan son tarihte hedefe düz çizgi.
  behindAmount: number | null;
  // İlk girdiden bugüne geçen gün (girdi yoksa null).
  daysElapsed: number | null;
  // Günlük ortalama ilerlemenin hedefe oranı (0..1; %'ye çevirip göster).
  dailyPercent: number | null;
  // Son 7 günde girilen toplam miktar (girdi yoksa null).
  last7Total: number | null;
  // Adımlar artık HER İKİ tipte de opsiyonel olabilir ('numeric' hedefe de
  // checklist eklenebilir) — bu alanlar milestonesTotal>0 iken doludur, tipe
  // bakılmaksızın.
  milestones: GoalMilestone[];
  // Adım görünümleri: miktarı olan adımlar current_value'dan kümülatif dolan
  // ara-eşik barları; miktarsızlar checklist (bkz. goalMilestoneRepo.milestoneViews).
  milestoneViews: MilestoneView[];
  milestonesDone: number;
  milestonesTotal: number;
  milestonesRemaining: number;
  milestonePaceDays: number | null; // ortalama: kalan her adım için kaç gün var
  milestoneWeeklyPace: number | null; // haftada tamamlanması gereken adım sayısı
  // Bu hedefe bağlı (goal_id ile işaretlenmiş) alışkanlıklar — bkz. HabitForm.linkGoal.
  linkedHabits: LinkedHabit[];
  // "Genel" sekmesindeki serbest miktar girişlerinin geçmişi (en yeniden en
  // eskiye) — yalnızca bir günlük, current_value'nun kaynağı DEĞİL.
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
  monthlyPace: null,
  avgDaily: null,
  projectedAtDeadline: null,
  projectedFinishDate: null,
  behindAmount: null,
  daysElapsed: null,
  dailyPercent: null,
  last7Total: null,
  milestones: [] as GoalMilestone[],
  milestoneViews: [] as MilestoneView[],
  milestonesDone: 0,
  milestonesTotal: 0,
  milestonesRemaining: 0,
  milestonePaceDays: null,
  milestoneWeeklyPace: null,
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

    // Tempo hesabı yalnız gelecekte (bugün dahil) bir son tarihi olan, henüz
    // tamamlanmamış hedefte anlamlı. "Bugün son gün" (daysLeft=0) -> kalanın
    // tamamı bugüne düşer, bölen en az 1 kabul edilir.
    const effectiveDays = daysLeft != null && daysLeft >= 0 ? Math.max(1, daysLeft) : null;
    const dailyPace =
      !completed && remaining != null && effectiveDays != null ? remaining / effectiveDays : null;
    const weeklyPace = dailyPace != null ? dailyPace * 7 : null;
    const monthlyPace = dailyPace != null ? dailyPace * 30 : null;

    // Adımlar tipten bağımsız çekilir: 'milestone' hedefte zorunlu iş akışının
    // parçası, 'numeric' hedefte miktarlı ara-eşik ya da (miktarsızsa) checklist
    // (tamamlanma durumunu ETKİLEMEZ — bkz. goalRepo.setCompleted'in tip koruması).
    // "done" sayısı görünümlerden gelir: eşik adımı current_value'dan, checklist
    // adımı completed kolonundan sayılır.
    const milestones = goalMilestoneRepo.listByGoal(goal.id);
    const views = computeMilestoneViews(milestones, goal.current_value);
    const milestonesDone = views.filter((v) => v.reached).length;
    const milestonesTotal = views.length;
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

    const entries = goalEntryRepo.listByGoal(goal.id);

    // Gerçekleşen tempo + projeksiyonlar (yalnız numeric hedefte anlamlı). Saf
    // fonksiyona çıkarıldı (bkz. lib/goalProjection.ts — tasarım kararları + test).
    const {
      avgDaily,
      daysElapsed,
      last7Total,
      projectedAtDeadline,
      projectedFinishDate,
      behindAmount,
      dailyPercent,
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
          })
        : {
            avgDaily: null,
            daysElapsed: null,
            last7Total: null,
            projectedAtDeadline: null,
            projectedFinishDate: null,
            behindAmount: null,
            dailyPercent: null,
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
      monthlyPace,
      avgDaily,
      projectedAtDeadline,
      projectedFinishDate,
      behindAmount,
      daysElapsed,
      dailyPercent,
      last7Total,
      milestones,
      milestoneViews: views,
      milestonesDone,
      milestonesTotal,
      milestonesRemaining,
      milestonePaceDays,
      milestoneWeeklyPace,
      linkedHabits,
      entries,
    });
  }, [goalId]);

  useFocusEffect(reload);

  return { ...stats, reload };
}
