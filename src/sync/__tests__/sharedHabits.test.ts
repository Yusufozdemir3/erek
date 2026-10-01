// Shared-habit client: the incremental cache is the performance contract
// (full history once, then only changes) and its merge must be
// last-writer-wins by log_date. Supabase is mocked.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
  },
}));

// eslint-disable-next-line import/first
import {
  getCachedSharedHabitLogs,
  getSharedHabits,
  mergeLogRows,
  shareHabit,
  syncSharedHabitLogs,
} from '../sharedHabits';

const HABIT = '11111111-1111-1111-1111-111111111111';
const pad = (n: number) => String(n).padStart(12, '0');

function logRow(i: number, over: Partial<Record<string, unknown>> = {}) {
  const d = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return {
    id: `00000000-0000-0000-0000-${pad(i)}`,
    log_date: d,
    completed: 1,
    amount: 0,
    updated_at: '2026-01-01T00:00:00Z',
    server_updated_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    ...over,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('mergeLogRows', () => {
  it('aynı güne ait iki satırdan updated_at daha yeni olan kazanır', () => {
    const map = new Map();
    mergeLogRows(map, [
      { log_date: '2026-06-01', completed: 1, amount: 3, updated_at: '2026-06-01T10:00:00Z' },
      { log_date: '2026-06-01', completed: 0, amount: 0, updated_at: '2026-06-01T09:00:00Z' },
    ]);
    expect(map.get('2026-06-01')).toEqual(['2026-06-01', 1, 3, Date.parse('2026-06-01T10:00:00Z')]);
  });
});

describe('syncSharedHabitLogs', () => {
  it('ilk seferde sayfalayarak tüm geçmişi çeker, imleci güvenlik payıyla geri sarıp saklar', async () => {
    const page1 = Array.from({ length: 2000 }, (_, i) => logRow(i));
    const page2 = [logRow(2000)];
    mockRpc.mockResolvedValueOnce({ data: page1, error: null }).mockResolvedValueOnce({ data: page2, error: null });

    const logs = await syncSharedHabitLogs(HABIT);

    expect(logs).toHaveLength(2001);
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_after_ts: '-infinity' });
    // Page 2 continues from the exact keyset of page 1's last row.
    expect(mockRpc.mock.calls[1][1]).toMatchObject({
      p_after_ts: page1[1999].server_updated_at,
      p_after_id: page1[1999].id,
    });
    const cached = JSON.parse((await AsyncStorage.getItem(`shared:habit:${HABIT}`))!);
    expect(cached.cursorTs).toBe(new Date(Date.parse(page2[0].server_updated_at) - 5000).toISOString());
  });

  it('sonraki açılışta yalnızca imleçten sonrasını ister ve önbellekle birleştirir', async () => {
    mockRpc.mockResolvedValueOnce({ data: [logRow(1), logRow(2)], error: null });
    await syncSharedHabitLogs(HABIT);

    const unchecked = logRow(2, { completed: 0, updated_at: '2026-02-01T00:00:00Z', server_updated_at: '2026-02-01T00:00:00Z' });
    mockRpc.mockResolvedValueOnce({ data: [unchecked], error: null });
    const logs = await syncSharedHabitLogs(HABIT);

    expect(mockRpc.mock.calls[1][1].p_after_ts).not.toBe('-infinity');
    expect(logs.map((l) => [l.log_date, l.completed])).toEqual([
      [logRow(1).log_date, 1],
      [logRow(2).log_date, 0],
    ]);
    expect(await getCachedSharedHabitLogs(HABIT)).toHaveLength(2);
  });

  it('paylaşım kaldırıldıysa ERK_NOT_SHARED fırlatır', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ERK_NOT_SHARED' } });
    await expect(syncSharedHabitLogs(HABIT)).rejects.toMatchObject({ code: 'ERK_NOT_SHARED' });
  });
});

describe('getSharedHabits', () => {
  it('artık paylaşılmayan alışkanlığın geçmişini cihazdan siler', async () => {
    await AsyncStorage.multiSet([
      [`shared:habit:${HABIT}`, JSON.stringify({ v: 1, rows: [], cursorTs: null, cursorId: 'x' })],
      ['shared:habits:lru', JSON.stringify([HABIT])],
    ]);
    mockRpc.mockResolvedValue({ data: [], error: null });

    await getSharedHabits();

    expect(await AsyncStorage.getItem(`shared:habit:${HABIT}`)).toBeNull();
  });

  it('sunucu satırını gizli alanlar olmadan Habit şekline çevirir', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: HABIT, title: 'Koşu', kind: 'binary', icon: null, color: null,
          schedule: '{"freq":"weekly","weekdays":[1,3]}', target_amount: null, unit: null,
          start_date: null, end_date: null, owner_id: 'u2', owner_name: 'Ada',
          owner_avatar: null, shared_at: '2026-09-01T00:00:00Z',
        },
      ],
      error: null,
    });
    const [s] = await getSharedHabits();
    expect(s.habit.schedule).toEqual({ freq: 'weekly', weekdays: [1, 3] });
    expect(s.habit.goal_id).toBeNull();
    expect(s.habit.remind_at).toBeNull();
    expect(s.owner.displayName).toBe('Ada');
  });
});

describe('shareHabit', () => {
  it('sunucunun döndürdüğü hata kodunu fırlatır', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'ERK_NOT_CONNECTED' }, error: null });
    await expect(shareHabit(HABIT, 'u2')).rejects.toMatchObject({ code: 'ERK_NOT_CONNECTED' });
  });
});
