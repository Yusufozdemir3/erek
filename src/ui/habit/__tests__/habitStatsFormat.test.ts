// habitStatsFormat tests — these formatters COULDN'T BE TESTED while embedded
// inside app/habit/[id].tsx (route files aren't in scope for the jest
// projects; audit H1+F1). Once split into their own module, the 'logic'
// project runs them directly.

import {
  fmtAmount,
  fmtCompact,
  fmtGoalValue,
  fmtHistoryValue,
  historyBarLabel,
  inkOn,
  PERIOD_OPTIONS,
  PERIOD_UNIT_KEY,
} from '../habitStatsFormat';
import type { Habit } from '@/db';

const habit = (over: Partial<Habit>): Habit =>
  ({
    id: 'h1',
    user_id: 'u1',
    goal_id: null,
    title: 'Test',
    kind: 'binary',
    remind_at: null,
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    start_date: null,
    end_date: null,
    goal_contribution: null,
    goal_factor: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    synced: 1,
    ...over,
  }) as Habit;

describe('fmtAmount', () => {
  it('tam sayıda ondalık göstermez', () => {
    expect(fmtAmount(5)).toBe('5');
  });

  it('ondalıklıda tek basamak gösterir', () => {
    expect(fmtAmount(5.46)).toBe('5.5');
  });
});

describe('fmtCompact', () => {
  it('binden küçükleri olduğu gibi bırakır', () => {
    expect(fmtCompact(999)).toBe('999');
  });

  it('binleri k ile kısaltır', () => {
    expect(fmtCompact(24500)).toBe('24.5k');
  });

  it('milyonları M ile kısaltır', () => {
    expect(fmtCompact(1_600_000)).toBe('1.6M');
  });

  it('negatif değerlerde de eşik MUTLAK değere göre', () => {
    expect(fmtCompact(-2500)).toBe('-2.5k');
  });
});

describe('fmtGoalValue — alışkanlık türüne göre', () => {
  it('ikilide (hedefsiz) yuvarlanmış gün sayısı', () => {
    expect(fmtGoalValue(habit({}), 12.6)).toBe('13');
  });

  it('zamanlayıcıda saat biçimi (saniye girdisi)', () => {
    expect(fmtGoalValue(habit({ kind: 'timer', target_amount: 1800 }), 3661)).toContain(':');
  });

  it('nicelde kısaltılmış miktar + birim', () => {
    expect(fmtGoalValue(habit({ kind: 'numeric', target_amount: 8, unit: 'bardak' }), 2400)).toBe(
      '2.4k bardak'
    );
  });

  it('nicelde birim yoksa yalnız sayı', () => {
    expect(fmtGoalValue(habit({ kind: 'numeric', target_amount: 8 }), 12)).toBe('12');
  });
});

describe('fmtHistoryValue — birim EKLEMEZ (dar sütun)', () => {
  it('nicelde birim yazılmaz', () => {
    expect(fmtHistoryValue(habit({ kind: 'numeric', target_amount: 8, unit: 'bardak' }), 2400)).toBe(
      '2.4k'
    );
  });

  it('zamanlayıcıda saniye toplamı SAAT olarak yazılır ("5.4k" değil)', () => {
    const v = fmtHistoryValue(habit({ kind: 'timer', target_amount: 1800 }), 5400);
    expect(v).toContain(':');
    expect(v).not.toContain('k');
  });
});

describe('inkOn — zemine göre mürekkep rengi', () => {
  it('koyu zeminde açık, açık zeminde koyu mürekkep seçer', () => {
    const onDark = inkOn('#1a1a1a');
    const onLight = inkOn('#ffffff');
    expect(onDark).not.toBe(onLight);
  });

  it('geçerli hex için her zaman bir renk döner', () => {
    for (const hex of ['#4f46e5', '#22c55e', '#facc15']) {
      expect(inkOn(hex)).toMatch(/^#/);
    }
  });
});

describe('historyBarLabel — eksen etiketi', () => {
  it('gün periyodunda ilk kovada ay adı da yazılır', () => {
    const label = historyBarLabel('day', '2026-07-15', null, 'tr');
    expect(label.length).toBeGreaterThan(0);
  });

  it('aynı ay içindeki sonraki kovada ay TEKRARLANMAZ', () => {
    const first = historyBarLabel('day', '2026-07-15', null, 'tr');
    const same = historyBarLabel('day', '2026-07-16', '2026-07-15', 'tr');
    expect(same.length).toBeLessThan(first.length);
  });

  it('ay değişince ay adı yeniden eklenir', () => {
    const crossing = historyBarLabel('day', '2026-08-01', '2026-07-31', 'tr');
    const within = historyBarLabel('day', '2026-08-02', '2026-08-01', 'tr');
    expect(crossing.length).toBeGreaterThan(within.length);
  });
});

describe('dönem sabitleri', () => {
  it('üç periyot da tanımlı ve sıralı', () => {
    expect(PERIOD_OPTIONS.map((p) => p.key)).toEqual(['day', 'week', 'month']);
  });

  it('her periyodun bir birim çeviri anahtarı var', () => {
    for (const { key } of PERIOD_OPTIONS) {
      expect(PERIOD_UNIT_KEY[key]).toBeTruthy();
    }
  });
});
