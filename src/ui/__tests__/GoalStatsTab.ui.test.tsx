// GoalStatsTab testleri — denetim bulgusu H1+F1'in kesiştiği yer: bu içerik
// app/goal/[id].tsx'in içinde gömülüyken TEST EDİLEMİYORDU (rota dosyaları
// hiçbir jest projesinin kapsamında değil). Ayrı bileşene çıkınca 'ui' projesi
// onu doğrudan render edebiliyor.
//
// Kilitlenen davranışlar: sonuç bandının üç tonu, sayısal/adım tipine göre
// hangi kartların çıktığı, gecikme durumunda kırmızı kart, sıradaki adım bloğu.

import { render, screen } from '@testing-library/react-native';
import { GoalStatsTab } from '@/ui/goal/GoalStatsTab';
import { makeGoalStyles } from '@/ui/goal/goalStyles';
import { lightColors } from '@/ui/theme';
import type { Goal } from '@/db';
import type { GoalStats } from '@/ui/useGoalStats';

const styles = makeGoalStyles(lightColors);

// Çeviri dublörü: anahtarı aynen döndürür (metin değil ANAHTAR aranır — sözlük
// değişince test kırılmasın, davranış test edilsin).
const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

const goal: Goal = {
  id: 'g1',
  user_id: 'u1',
  title: 'Kitap oku',
  goal_type: 'numeric',
  target_value: 200,
  current_value: 50,
  unit: 'sayfa',
  deadline: '2026-08-30',
  completed_at: null,
  remind_at: null,
  start_date: '2026-07-01',
  updated_at: '2026-07-01T00:00:00.000Z',
  deleted_at: null,
  synced: 1,
};

const baseStats: GoalStats = {
  goal,
  ratio: 0.25,
  remaining: 150,
  completed: false,
  daysLeft: 38,
  isOverdue: false,
  overdueDays: null,
  dailyPace: 4,
  weeklyPace: 28,
  avgDaily: 2,
  projectedAtDeadline: 126,
  projectedFinishDate: '2026-09-15',
  behindAmount: 74,
  daysElapsed: 23,
  last7Total: 14,
  milestones: [],
  milestoneViews: [],
  milestonesDone: 0,
  milestonesTotal: 0,
  milestonesRemaining: 0,
  nextMilestone: null,
  linkedHabits: [],
  entries: [],
  reload: () => {},
};

const renderTab = (stats: Partial<GoalStats> = {}, g: Partial<Goal> = {}) =>
  render(
    <GoalStatsTab
      goal={{ ...goal, ...g }}
      stats={{ ...baseStats, ...stats }}
      t={t}
      lang="tr"
      styles={styles}
    />
  );

describe('GoalStatsTab — sonuç bandı', () => {
  it('tahmini bitiş son tarihten SONRAYSA gecikme cümlesi + düzeltme temposu', () => {
    renderTab();
    expect(screen.getByText(/goalStats\.verdictLate/)).toBeTruthy();
    expect(screen.getByText(/goalStats\.verdictFix/)).toBeTruthy();
  });

  it('tahmini bitiş son tarihten ÖNCEYSE erken cümlesi', () => {
    renderTab({ projectedFinishDate: '2026-08-10' });
    expect(screen.getByText(/goalStats\.verdictEarly/)).toBeTruthy();
  });

  it('tamamlanmış hedefte kutlama cümlesi', () => {
    renderTab({ completed: true });
    expect(screen.getByText('goalStats.verdictDone')).toBeTruthy();
  });

  it('adım tipi hedefte bant HİÇ çizilmez', () => {
    renderTab({}, { goal_type: 'milestone' });
    expect(screen.queryByText(/goalStats\.verdict/)).toBeNull();
  });
});

describe('GoalStatsTab — kart görünürlüğü', () => {
  it('sayısal hedefte ilerleme ve kalan kartları çıkar', () => {
    renderTab();
    expect(screen.getByText('goal.statRatio')).toBeTruthy();
    expect(screen.getByText('%25')).toBeTruthy();
    expect(screen.getByText('goal.statRemaining')).toBeTruthy();
  });

  it('adım tipi hedefte ilerleme/kalan kartları çıkmaz', () => {
    renderTab({}, { goal_type: 'milestone' });
    expect(screen.queryByText('goal.statRatio')).toBeNull();
  });

  it('gecikmede kalan gün yerine gecikme kartı gösterilir', () => {
    renderTab({ isOverdue: true, overdueDays: 5, daysLeft: -5 });
    expect(screen.getByText('goalStats.overdueDaysLabel')).toBeTruthy();
    expect(screen.queryByText('goalStats.daysLeftLabel')).toBeNull();
  });

  it('"senin temponun" grubu avgDaily yokken hiç çizilmez', () => {
    renderTab({ avgDaily: null, projectedFinishDate: null, last7Total: null });
    expect(screen.queryByText('goalStats.groupYourPace')).toBeNull();
    expect(screen.getByText('goalStats.groupRequiredPace')).toBeTruthy();
  });

  it('bu hızla bitiş ve son tarihteki miktar kartları görünür', () => {
    renderTab();
    expect(screen.getByText('goalStats.projectedFinishLabel')).toBeTruthy();
    expect(screen.getByText('goalStats.projectedAtDeadlineLabel')).toBeTruthy();
  });

  it('son tarihi olmayan hedefte uyarı satırı çıkar', () => {
    renderTab({ dailyPace: null, weeklyPace: null }, { deadline: null });
    expect(screen.getByText('goalStats.noDeadline')).toBeTruthy();
  });
});

describe('GoalStatsTab — sıradaki adım', () => {
  const next = {
    title: 'İlk yarı',
    targetAmount: 100,
    remainingAmount: 50,
    ratio: 0.5,
    dueDate: '2026-08-01',
    daysLeft: 9,
    isOverdue: false,
    overdueDays: null,
  };

  it('adım yoksa bölüm hiç çizilmez', () => {
    renderTab();
    expect(screen.queryByText('goalStats.groupMilestones')).toBeNull();
  });

  it('sıradaki adımın başlığı, yüzdesi, hedefi ve kalanı gösterilir', () => {
    renderTab({ milestonesTotal: 3, milestonesRemaining: 2, nextMilestone: next });
    expect(screen.getByText('İlk yarı')).toBeTruthy();
    expect(screen.getByText('%50')).toBeTruthy();
    expect(screen.getByText('goalStats.nextMilestoneTargetLabel')).toBeTruthy();
    expect(screen.getByText('goalStats.nextMilestoneRemainingLabel')).toBeTruthy();
    expect(screen.getByText('goalStats.nextMilestoneDaysLeftLabel')).toBeTruthy();
  });

  it('gecikmiş adımda gecikme kartı, kalan gün kartı yerine geçer', () => {
    renderTab({
      milestonesTotal: 3,
      nextMilestone: { ...next, daysLeft: -4, isOverdue: true, overdueDays: 4 },
    });
    expect(screen.getByText('goalStats.nextMilestoneOverdueLabel')).toBeTruthy();
    expect(screen.queryByText('goalStats.nextMilestoneDaysLeftLabel')).toBeNull();
  });

  it('miktarsız (checklist) adımda hedef/kalan kartları çıkmaz', () => {
    renderTab({
      milestonesTotal: 2,
      nextMilestone: { ...next, targetAmount: null, remainingAmount: null, ratio: 0 },
    });
    expect(screen.getByText('goalStats.nextMilestoneRatioLabel')).toBeTruthy();
    expect(screen.queryByText('goalStats.nextMilestoneTargetLabel')).toBeNull();
  });

  it('tüm adımlar bittiyse kutlama satırı çıkar', () => {
    renderTab({ milestonesTotal: 3, milestonesDone: 3, nextMilestone: null });
    expect(screen.getByText('goalStats.allMilestonesDone')).toBeTruthy();
  });
});
