// Hedefler widget'ı: hangi hedefler, hangi sırayla, yüzde.

import { MAX_WIDGET_GOALS, pickGoals, type GoalInput } from '../widgetGoals';

const g = (id: string, over: Partial<GoalInput> = {}): GoalInput => ({
  id, title: id, deadline: null, completed: false, ratio: 0, ...over,
});

describe('pickGoals', () => {
  it('biten hedefler gösterilmez', () => {
    expect(pickGoals([g('a'), g('b', { completed: true })]).map((x) => x.id)).toEqual(['a']);
  });

  it('en yakın son tarih önde, tarihsiz sonda; eşitlikte ilerleyen önde', () => {
    const picks = pickGoals([
      g('tarihsiz', { ratio: 0.9 }),
      g('uzak', { deadline: '2026-12-01' }),
      g('yakin', { deadline: '2026-10-10' }),
      g('yakin-ilerli', { deadline: '2026-10-10', ratio: 0.5 }),
    ]);
    expect(picks.map((x) => x.id)).toEqual(['yakin-ilerli', 'yakin', 'uzak', 'tarihsiz']);
  });

  it('yüzde yuvarlanır ve 0-100 arasına sıkıştırılır; bozuk oran 0 olur', () => {
    const p = pickGoals([g('a', { ratio: 0.456 }), g('b', { ratio: 7 }), g('c', { ratio: -1 }), g('d', { ratio: NaN })]);
    expect(Object.fromEntries(p.map((x) => [x.id, x.percent]))).toEqual({ a: 46, b: 100, c: 0, d: 0 });
  });

  it('en fazla sınır kadar hedef', () => {
    const many = Array.from({ length: 12 }, (_, i) => g('g' + i));
    expect(pickGoals(many)).toHaveLength(MAX_WIDGET_GOALS);
    expect(pickGoals(many, 2)).toHaveLength(2);
  });
});
