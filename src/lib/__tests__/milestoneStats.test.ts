// nextMilestoneStat testleri — hedef istatistiklerinin altındaki "sıradaki adım"
// bölümü (kullanıcı kararı 2026-07-23: toplu adım temposu yerine tek eşik).

import { nextMilestoneStat } from '../milestoneStats';
import type { GoalMilestone, MilestoneView } from '@/db';

const TODAY = '2026-07-23';

function milestone(over: Partial<GoalMilestone> & { title: string }): GoalMilestone {
  return {
    id: `m-${over.title}`,
    goal_id: 'g1',
    completed: 0,
    position: 0,
    amount: null,
    due_date: null,
    updated_at: '2026-07-01T00:00:00.000Z',
    deleted_at: null,
    synced: 1,
    ...over,
  };
}

// milestoneViews'in ürettiğine denk görünüm (miktarlı adım: current/amount).
function view(m: GoalMilestone, currentValue: number): MilestoneView {
  if (m.amount == null || m.amount <= 0) {
    return { milestone: m, ratio: m.completed === 1 ? 1 : 0, reached: m.completed === 1 };
  }
  return {
    milestone: m,
    ratio: Math.max(0, Math.min(1, currentValue / m.amount)),
    reached: currentValue >= m.amount,
  };
}

describe('nextMilestoneStat — hangi adım "sıradaki"', () => {
  it('ulaşılmamış İLK adımı seçer (liste sırası)', () => {
    const current = 30;
    const ms = [
      milestone({ title: '20 km', amount: 20, position: 0 }),
      milestone({ title: '50 km', amount: 50, position: 1 }),
      milestone({ title: '100 km', amount: 100, position: 2 }),
    ];
    const stat = nextMilestoneStat(ms.map((m) => view(m, current)), current, TODAY);
    expect(stat?.title).toBe('50 km'); // 20 aşıldı, sıradaki 50
  });

  it('hiç adım yoksa null', () => {
    expect(nextMilestoneStat([], 0, TODAY)).toBeNull();
  });

  it('hepsi tamamlandıysa null (ekran "tümü bitti" gösterir)', () => {
    const current = 100;
    const ms = [
      milestone({ title: '20 km', amount: 20 }),
      milestone({ title: '50 km', amount: 50 }),
    ];
    expect(nextMilestoneStat(ms.map((m) => view(m, current)), current, TODAY)).toBeNull();
  });

  it('checklist adımında işaretlenmemiş ilkini seçer', () => {
    const ms = [
      milestone({ title: 'Plan yap', completed: 1 }),
      milestone({ title: 'Malzeme al', completed: 0 }),
      milestone({ title: 'Başla', completed: 0 }),
    ];
    const stat = nextMilestoneStat(ms.map((m) => view(m, 0)), 0, TODAY);
    expect(stat?.title).toBe('Malzeme al');
  });
});

describe('nextMilestoneStat — miktar alanları', () => {
  it('hedef, kalan ve yüzde miktarlı adımda dolu', () => {
    const current = 30;
    const m = milestone({ title: '50 km', amount: 50 });
    const stat = nextMilestoneStat([view(m, current)], current, TODAY)!;
    expect(stat.targetAmount).toBe(50);
    expect(stat.remainingAmount).toBe(20);
    expect(stat.ratio).toBeCloseTo(0.6);
  });

  it('checklist adımında hedef/kalan null, yüzde 0', () => {
    const m = milestone({ title: 'Malzeme al' });
    const stat = nextMilestoneStat([view(m, 0)], 0, TODAY)!;
    expect(stat.targetAmount).toBeNull();
    expect(stat.remainingAmount).toBeNull();
    expect(stat.ratio).toBe(0);
  });

  it('mevcut değer adım hedefini aşsa bile kalan negatif olmaz', () => {
    // Kümülatif eşik mantığında bu adım zaten "ulaşıldı" sayılırdı; savunma amaçlı.
    const m = milestone({ title: '50 km', amount: 50 });
    const stat = nextMilestoneStat(
      [{ milestone: m, ratio: 1, reached: false }], // bilerek tutarsız görünüm
      80,
      TODAY
    )!;
    expect(stat.remainingAmount).toBe(0);
  });

  it('amount 0 ise miktarsız (checklist) sayılır', () => {
    const m = milestone({ title: 'Sıfır', amount: 0 });
    const stat = nextMilestoneStat([view(m, 10)], 10, TODAY)!;
    expect(stat.targetAmount).toBeNull();
  });
});

describe('nextMilestoneStat — gün alanları', () => {
  it('gelecekteki son tarihte kalan gün pozitif, gecikme yok', () => {
    const m = milestone({ title: '50 km', amount: 50, due_date: '2026-07-30' });
    const stat = nextMilestoneStat([view(m, 10)], 10, TODAY)!;
    expect(stat.daysLeft).toBe(7);
    expect(stat.isOverdue).toBe(false);
    expect(stat.overdueDays).toBeNull();
  });

  it('geçmiş son tarihte gecikme gün sayısı pozitif verilir', () => {
    const m = milestone({ title: '50 km', amount: 50, due_date: '2026-07-18' });
    const stat = nextMilestoneStat([view(m, 10)], 10, TODAY)!;
    expect(stat.daysLeft).toBe(-5);
    expect(stat.isOverdue).toBe(true);
    expect(stat.overdueDays).toBe(5);
  });

  it('bugün son gün ise gecikmiş SAYILMAZ', () => {
    const m = milestone({ title: '50 km', amount: 50, due_date: TODAY });
    const stat = nextMilestoneStat([view(m, 10)], 10, TODAY)!;
    expect(stat.daysLeft).toBe(0);
    expect(stat.isOverdue).toBe(false);
  });

  it('son tarihi olmayan adımda gün alanları null', () => {
    const m = milestone({ title: '50 km', amount: 50 });
    const stat = nextMilestoneStat([view(m, 10)], 10, TODAY)!;
    expect(stat.dueDate).toBeNull();
    expect(stat.daysLeft).toBeNull();
    expect(stat.isOverdue).toBe(false);
  });
});
