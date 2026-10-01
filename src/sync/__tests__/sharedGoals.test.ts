// Shared-goal client: the RPC's jsonb must map onto the app's Goal/GoalEntry
// shapes (so the owner's stats math runs unchanged on a friend's goal), server
// errors must surface as their ERK_* codes, and stale caches must not linger.
// Supabase is mocked.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
  },
}));

// eslint-disable-next-line import/first
import {
  addSharedGoalEntry,
  getCachedSharedGoalDetail,
  getSharedGoalDetail,
  getSharedGoals,
  parseGoalDetail,
  shareGoal,
} from '../sharedGoals';
// eslint-disable-next-line import/first
import { SharingError } from '../sharingErrors';

const GOAL = '22222222-2222-2222-2222-222222222222';
const OWNER = '00000000-0000-0000-0000-00000000000a';
const FRIEND = '00000000-0000-0000-0000-00000000000b';

const detailPayload = {
  goal: {
    id: GOAL,
    title: '100 km koşu',
    goal_type: 'numeric',
    target_value: 100,
    current_value: 42,
    unit: 'km',
    deadline: '2026-12-31',
    completed_at: null,
    start_date: '2026-09-01',
    owner_id: OWNER,
    owner_name: 'Ayşe',
    owner_avatar: null,
  },
  milestones: [{ id: 'm1', title: 'İlk 50', completed: 0, position: 0, amount: 50, due_date: null, updated_at: '2026-09-01T00:00:00Z' }],
  entries: [
    { id: 'e2', amount: 5, updated_at: '2026-09-20T10:00:00Z', added_by: FRIEND, added_by_name: 'Mehmet' },
    { id: 'e1', amount: 37, updated_at: '2026-09-10T10:00:00Z', added_by: OWNER, added_by_name: 'Ayşe' },
  ],
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('parseGoalDetail', () => {
  it('hedefi, adımları ve kimin eklediğiyle girdileri uygulamanın tiplerine çevirir', () => {
    const d = parseGoalDetail(GOAL, detailPayload);

    expect(d.goal).toMatchObject({ id: GOAL, user_id: OWNER, current_value: 42, target_value: 100, unit: 'km' });
    expect(d.owner).toMatchObject({ id: OWNER, displayName: 'Ayşe' });
    expect(d.milestones[0]).toMatchObject({ goal_id: GOAL, amount: 50, completed: 0 });
    expect(d.entries.map((e) => [e.id, e.amount, e.added_by])).toEqual([
      ['e2', 5, FRIEND],
      ['e1', 37, OWNER],
    ]);
    expect(d.names).toEqual({ [FRIEND]: 'Mehmet', [OWNER]: 'Ayşe' });
  });

  it('boş listeler ve eksik alanlarla çökmez', () => {
    const d = parseGoalDetail(GOAL, { goal: { id: GOAL, title: 'X', owner_id: OWNER } });
    expect(d.milestones).toEqual([]);
    expect(d.entries).toEqual([]);
    expect(d.goal.current_value).toBe(0);
  });
});

describe('getSharedGoalDetail', () => {
  it('sunucudan çeker ve çevrimdışı için önbelleğe yazar', async () => {
    mockRpc.mockResolvedValueOnce({ data: detailPayload, error: null });

    const d = await getSharedGoalDetail(GOAL);

    expect(mockRpc).toHaveBeenCalledWith('get_shared_goal_detail', { p_goal_id: GOAL });
    expect(d.goal.title).toBe('100 km koşu');
    expect((await getCachedSharedGoalDetail(GOAL))?.goal.current_value).toBe(42);
  });

  it('paylaşım kalktıysa ERK_NOT_SHARED fırlatır', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'ERK_NOT_SHARED' } });
    await expect(getSharedGoalDetail(GOAL)).rejects.toMatchObject({ code: 'ERK_NOT_SHARED' });
  });
});

describe('getSharedGoals', () => {
  it('artık paylaşılmayan hedeflerin önbelleğini cihazdan siler', async () => {
    await AsyncStorage.setItem(`shared:goal:${GOAL}`, '{}');
    await AsyncStorage.setItem('shared:goal:eski-hedef', '{}');
    mockRpc.mockResolvedValueOnce({
      data: [{ ...detailPayload.goal, shared_at: '2026-09-01T00:00:00Z' }],
      error: null,
    });

    const list = await getSharedGoals();

    expect(list).toHaveLength(1);
    expect(list[0].goal.id).toBe(GOAL);
    expect(await AsyncStorage.getItem(`shared:goal:${GOAL}`)).not.toBeNull();
    expect(await AsyncStorage.getItem('shared:goal:eski-hedef')).toBeNull();
  });
});

describe('addSharedGoalEntry', () => {
  it('uygulanan miktarı ve yeni toplamı döndürür', async () => {
    mockRpc.mockResolvedValueOnce({ data: { applied: 5, current_value: 47 }, error: null });

    await expect(addSharedGoalEntry(GOAL, 5)).resolves.toEqual({ applied: 5, currentValue: 47 });
    expect(mockRpc).toHaveBeenCalledWith('add_shared_goal_entry', { p_goal_id: GOAL, p_amount: 5 });
  });

  it('sunucunun döndürdüğü hata kodunu (ör. başkasının katkısını geri alma) SharingError olarak yüzeye çıkarır', async () => {
    mockRpc.mockResolvedValueOnce({ data: { error: 'ERK_CORRECTION_LIMIT' }, error: null });
    await expect(addSharedGoalEntry(GOAL, -10)).rejects.toMatchObject({ code: 'ERK_CORRECTION_LIMIT' });
  });

  it('sıfır / geçersiz miktarı sunucuya hiç göndermez', async () => {
    await expect(addSharedGoalEntry(GOAL, 0)).rejects.toBeInstanceOf(SharingError);
    await expect(addSharedGoalEntry(GOAL, Number.NaN)).rejects.toMatchObject({ code: 'ERK_INVALID_AMOUNT' });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('shareGoal', () => {
  it('buluta henüz gitmemiş hedefte ERK_GOAL_NOT_SYNCED verir (UI senkron yapıp yeniden dener)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { error: 'ERK_GOAL_NOT_SYNCED' }, error: null });
    await expect(shareGoal(GOAL, FRIEND)).rejects.toMatchObject({ code: 'ERK_GOAL_NOT_SYNCED' });
  });
});
