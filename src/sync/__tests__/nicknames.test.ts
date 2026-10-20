// Friend nicknames: applied on read, kept off the sharing caches, saved to the
// user's own table, and wiped with the other sharing data.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockUpsert = jest.fn();
const mockDeleteEq = jest.fn();
const mockSelect = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: () => ({
      select: () => mockSelect(),
      upsert: (row: unknown, opts: unknown) => mockUpsert(row, opts),
      delete: () => ({ eq: (c: string, v: string) => mockDeleteEq(c, v) }),
    }),
  },
}));

// eslint-disable-next-line import/first
import { clearNicknames, named, nameFor, nicknameOf, refreshNicknames, setNickname } from '../nicknames';
// eslint-disable-next-line import/first
import { clearSharedData, getCachedFriends, listConnections, type Friend } from '../friends';

const friend: Friend = { id: 'f1', displayName: 'Ayşe', avatarUrl: null, connectedAt: null };

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await clearNicknames();
  mockUpsert.mockResolvedValue({ error: null });
  mockDeleteEq.mockResolvedValue({ error: null });
});

describe('takma ad', () => {
  it('takma ad yokken arkadaşı olduğu gibi döndürür', () => {
    expect(named(friend)).toBe(friend);
    expect(nameFor('f1', 'Ayşe')).toBe('Ayşe');
  });

  it('kaydedince görünen ad değişir, gerçek ad originalName’de kalır', async () => {
    expect(await setNickname('f1', '  Annem  ')).toBe(true);
    expect(mockUpsert).toHaveBeenCalledWith({ friend_id: 'f1', nickname: 'Annem' }, { onConflict: 'user_id,friend_id' });
    expect(named(friend)).toMatchObject({ displayName: 'Annem', originalName: 'Ayşe' });
    expect(nameFor('f1', 'Ayşe')).toBe('Annem');
    // Applying it twice keeps the real name.
    expect(named(named(friend)).originalName).toBe('Ayşe');
  });

  it('boş metin takma adı kaldırır', async () => {
    await setNickname('f1', 'Annem');
    expect(await setNickname('f1', '   ')).toBe(true);
    expect(mockDeleteEq).toHaveBeenCalledWith('friend_id', 'f1');
    expect(nicknameOf('f1')).toBeNull();
  });

  it('kaydedilemezse yerel görünüm değişmez', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'x' } });
    expect(await setNickname('f1', 'Annem')).toBe(false);
    expect(nicknameOf('f1')).toBeNull();
  });

  it('sunucudan gelenleri alır; hata olursa eskiler kalır', async () => {
    mockSelect.mockResolvedValueOnce({ data: [{ friend_id: 'f1', nickname: 'Patron' }], error: null });
    await refreshNicknames();
    expect(nicknameOf('f1')).toBe('Patron');
    mockSelect.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await refreshNicknames();
    expect(nicknameOf('f1')).toBe('Patron');
  });

  it('arkadaş listesi önbelleği gerçek adı tutar, okurken takma ad uygulanır', async () => {
    const { supabase } = jest.requireMock('../supabase');
    supabase.rpc.mockResolvedValue({
      data: [{ id: 'f1', display_name: 'Ayşe', avatar_url: null, connected_at: null }],
      error: null,
    });
    mockSelect.mockResolvedValue({ data: [{ friend_id: 'f1', nickname: 'Annem' }], error: null });

    const fresh = await listConnections();
    expect(fresh[0].displayName).toBe('Annem');
    expect(JSON.parse((await AsyncStorage.getItem('friends:cache'))!)[0].displayName).toBe('Ayşe');
    expect((await getCachedFriends())[0].displayName).toBe('Annem');
  });

  it('paylaşım verisi silinirken takma adlar da silinir', async () => {
    await setNickname('f1', 'Annem');
    await clearSharedData();
    expect(nicknameOf('f1')).toBeNull();
    expect(await AsyncStorage.getItem('nicknames:v1')).toBeNull();
  });
});
