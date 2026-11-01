// Shared-habit groups client: the group list is parsed, other members' logs
// arrive incrementally, and a change in who is followed restarts the cursor
// (a newcomer's older history must not be skipped). Supabase is mocked.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
  },
}));

// eslint-disable-next-line import/first
import { getCachedHabitGroups, joinHabitGroup, refreshHabitGroups } from '../habitGroups';

const ownerRow = { id: 'ali', habit_id: 'h-ali', is_owner: true, is_me: false, joined_at: '2026-10-01T09:00:00Z', name: 'Ali', avatar: null, skip_dates: '["2026-10-05"]' };
const meRow = { id: 'ece', habit_id: 'h-ece', is_owner: false, is_me: true, joined_at: '2026-10-01T09:00:00Z', name: 'Ece', avatar: null, skip_dates: null };
const canRow = { id: 'can', habit_id: 'h-can', is_owner: false, is_me: false, joined_at: '2026-10-10T09:00:00Z', name: 'Can', avatar: null, skip_dates: null };

function log(habit_id: string, log_date: string, i: number, completed = 1) {
  return {
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    habit_id,
    log_date,
    completed,
    amount: 0,
    updated_at: '2026-10-20T00:00:00Z',
    server_updated_at: new Date(Date.UTC(2026, 9, 20) + i * 1000).toISOString(),
  };
}

function respond(groups: unknown, ...logPages: unknown[][]) {
  mockRpc.mockImplementation((fn: string) => {
    if (fn === 'get_my_habit_groups') return Promise.resolve({ data: groups, error: null });
    if (fn === 'get_habit_group_logs') return Promise.resolve({ data: logPages.shift() ?? [], error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('refreshHabitGroups', () => {
  it('grupları ve öteki üyelerin kayıtlarını getirir, önbelleğe yazar', async () => {
    respond([{ group_id: 'h-ali', members: [ownerRow, meRow] }], [log('h-ali', '2026-10-19', 1), log('h-ali', '2026-10-20', 2, 0)]);

    const snap = await refreshHabitGroups();

    expect(snap.groups).toHaveLength(1);
    expect(snap.groups[0].members.map((m) => [m.id, m.isOwner, m.isMe])).toEqual([
      ['ali', true, false],
      ['ece', false, true],
    ]);
    expect(snap.groups[0].members[0].skipDates).toEqual(['2026-10-05']);
    expect(snap.logs['h-ali']).toEqual({ '2026-10-19': true, '2026-10-20': false });
    expect(await getCachedHabitGroups()).toEqual(snap);
  });

  it('sonraki yenilemede imleçten devam eder', async () => {
    respond([{ group_id: 'h-ali', members: [ownerRow, meRow] }], [log('h-ali', '2026-10-19', 1)]);
    await refreshHabitGroups();
    respond([{ group_id: 'h-ali', members: [ownerRow, meRow] }], [log('h-ali', '2026-10-20', 2)]);

    const snap = await refreshHabitGroups();

    const logCalls = mockRpc.mock.calls.filter(([fn]) => fn === 'get_habit_group_logs');
    expect(logCalls[0][1]).toMatchObject({ p_after_ts: '-infinity' });
    expect(logCalls[0][1].p_after_ts).not.toBe(logCalls[logCalls.length - 1][1].p_after_ts);
    expect(snap.logs['h-ali']).toEqual({ '2026-10-19': true, '2026-10-20': true });
  });

  it('biri katılınca imleç baştan başlar; ayrılanın kayıtları silinir', async () => {
    respond([{ group_id: 'h-ali', members: [ownerRow, meRow] }], [log('h-ali', '2026-10-19', 1)]);
    await refreshHabitGroups();

    respond([{ group_id: 'h-ali', members: [ownerRow, meRow, canRow] }], [log('h-ali', '2026-10-19', 1), log('h-can', '2026-10-11', 2)]);
    let snap = await refreshHabitGroups();
    const logCalls = mockRpc.mock.calls.filter(([fn]) => fn === 'get_habit_group_logs');
    expect(logCalls[logCalls.length - 1][1]).toMatchObject({ p_after_ts: '-infinity' });
    expect(snap.logs['h-can']).toEqual({ '2026-10-11': true });

    respond([{ group_id: 'h-ali', members: [ownerRow, meRow] }], []);
    snap = await refreshHabitGroups();
    expect(snap.logs['h-can']).toBeUndefined();
  });

  it('grup yoksa kayıt istemez', async () => {
    respond([]);
    const snap = await refreshHabitGroups();
    expect(snap).toEqual({ groups: [], logs: {} });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});

describe('joinHabitGroup', () => {
  it('kopyanın id’sini döner; sunucu hatası kodlu hataya çevrilir', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, habit_id: 'h-new' }, error: null });
    await expect(joinHabitGroup('h-ali', '2026-10-29')).resolves.toBe('h-new');
    expect(mockRpc).toHaveBeenCalledWith('join_habit_group', { p_habit_id: 'h-ali', p_today: '2026-10-29' });

    mockRpc.mockResolvedValueOnce({ data: { error: 'ERK_GROUP_FULL' }, error: null });
    await expect(joinHabitGroup('h-ali', '2026-10-29')).rejects.toMatchObject({ code: 'ERK_GROUP_FULL' });
  });
});
