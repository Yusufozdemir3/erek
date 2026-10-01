// friends / sharingErrors tests. The RPCs themselves run on Supabase (verified
// with supabase/tests/sharing_checks.sql); these cover the client contract:
// server ERK_* codes and network failures map to known codes (never raw
// Postgres text), and other people's data is wiped with the session.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockRpc = jest.fn();
const mockSignOut = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    rpc: (fn: string, args?: unknown) => mockRpc(fn, args),
    auth: { signOut: () => mockSignOut() },
  },
}));

// eslint-disable-next-line import/first
import {
  clearSharedData,
  getCachedFriends,
  getInvite,
  listConnections,
  normalizeInviteCode,
  redeemInvite,
  removeConnection,
} from '../friends';
// eslint-disable-next-line import/first
import { SharingError, sharingErrorKey, toSharingError } from '../sharingErrors';
// eslint-disable-next-line import/first
import { signOutAccount } from '../auth';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('normalizeInviteCode', () => {
  it('büyük harfe çevirir, harf/rakam dışını atar, 8 karakterde keser', () => {
    expect(normalizeInviteCode(' ab-cd 23 45xyz ')).toBe('ABCD2345');
  });
});

describe('toSharingError', () => {
  it('Postgrest hata nesnesindeki ERK kodunu tanır', () => {
    expect(toSharingError({ message: 'ERK_AUTH' }).code).toBe('ERK_AUTH');
  });

  it('ağ hatasını ERK_NETWORK yapar', () => {
    expect(toSharingError(new TypeError('Network request failed')).code).toBe('ERK_NETWORK');
  });

  it('tanımsız hata ham metin yerine ERK_UNKNOWN çevirisine gider', () => {
    expect(sharingErrorKey(new Error('duplicate key value violates ...'))).toBe('friends.err.ERK_UNKNOWN');
  });
});

describe('RPC sarmalayıcıları', () => {
  it('getInvite tablo dönüşünü (dizi) koda çevirir', async () => {
    mockRpc.mockResolvedValue({ data: [{ code: 'ABCD2345', expires_at: '2026-10-02T10:00:00Z' }], error: null });
    await expect(getInvite()).resolves.toEqual({ code: 'ABCD2345', expiresAt: '2026-10-02T10:00:00Z' });
    expect(mockRpc).toHaveBeenCalledWith('get_or_create_invite', { p_rotate: false });
  });

  it('redeemInvite sunucunun döndürdüğü hata kodunu SharingError olarak fırlatır', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'ERK_INVITE_INVALID' }, error: null });
    await expect(redeemInvite('abcd2345')).rejects.toMatchObject({ code: 'ERK_INVITE_INVALID' });
    expect(mockRpc).toHaveBeenCalledWith('redeem_invite', { p_code: 'ABCD2345' });
  });

  it('redeemInvite başarıda arkadaşı döner', async () => {
    mockRpc.mockResolvedValue({
      data: { friend: { id: 'u2', display_name: 'Ada', avatar_url: null } },
      error: null,
    });
    await expect(redeemInvite('ABCD2345')).resolves.toMatchObject({ id: 'u2', displayName: 'Ada' });
  });

  it('listConnections önbelleğe yazar, removeConnection önbellekten çıkarır', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: 'u2', display_name: 'Ada', avatar_url: null, connected_at: 'x' },
        { id: 'u3', display_name: 'Can', avatar_url: null, connected_at: 'y' },
      ],
      error: null,
    });
    await listConnections();
    expect((await getCachedFriends()).map((f) => f.id)).toEqual(['u2', 'u3']);

    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await removeConnection('u2');
    expect((await getCachedFriends()).map((f) => f.id)).toEqual(['u3']);
  });

  it('RPC hatası SharingError olarak sarılır', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ERK_AUTH' } });
    const err = await listConnections().catch((e) => e);
    expect(err).toBeInstanceOf(SharingError);
    expect(err.code).toBe('ERK_AUTH');
  });
});

describe('paylaşım önbelleği temizliği', () => {
  it('yalnızca arkadaş/paylaşım anahtarlarını siler', async () => {
    await AsyncStorage.multiSet([
      ['friends:cache', '[]'],
      ['shared:habit:h1', '{}'],
      ['theme:mode', 'dark'],
    ]);
    await clearSharedData();
    expect(await AsyncStorage.getItem('friends:cache')).toBeNull();
    expect(await AsyncStorage.getItem('shared:habit:h1')).toBeNull();
    expect(await AsyncStorage.getItem('theme:mode')).toBe('dark');
  });

  it('çıkış yapınca arkadaşların verisi cihazda kalmaz', async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await AsyncStorage.setItem('friends:cache', '[{"id":"u2"}]');
    await signOutAccount();
    expect(await AsyncStorage.getItem('friends:cache')).toBeNull();
  });
});
