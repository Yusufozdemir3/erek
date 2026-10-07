// auth: sync only works with an account the user signed into. The guard in
// afterEach keeps every path from ever opening an anonymous session (that
// would silently upload local data, against privacy policy §1).

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSignOut = jest.fn();
const mockRpc = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInAnonymously: () => mockSignInAnonymously(),
      signOut: () => mockSignOut(),
    },
    rpc: (fn: string) => mockRpc(fn),
  },
}));

import { deleteAccountAndData, ensureSignedIn, signOutAccount } from '../auth';

const OWNER_UID_KEY = 'sync:ownerUid';
const noSession = { data: { session: null } };
const sessionOf = (id: string, isAnonymous = false) => ({
  data: { session: { user: { id, is_anonymous: isAnonymous } } },
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockGetSession.mockResolvedValue(noSession);
  mockSignInAnonymously.mockResolvedValue({ data: { user: { id: 'anon-1' } }, error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
});

// No path may ever sign in anonymously.
afterEach(() => {
  expect(mockSignInAnonymously).not.toHaveBeenCalled();
});

describe('ensureSignedIn — oturum AÇMAZ, yalnızca var olanı kullanır', () => {
  it('oturum yoksa null döner (senkron devre dışı), anonim oturum açmaz', async () => {
    expect(await ensureSignedIn()).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('gerçek HESAP oturumu varsa uid döner', async () => {
    mockGetSession.mockResolvedValue(sessionOf('hesap-1'));
    expect(await ensureSignedIn()).toBe('hesap-1');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('is_anonymous alanı hiç yoksa oturum HESAP sayılır (geriye uyum)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'hesap-2' } } } });
    expect(await ensureSignedIn()).toBe('hesap-2');
  });

  it('KALINTI anonim oturumu kullanmaz: kapatır ve null döner', async () => {
    // Opened automatically by an old version; using it would upload silently.
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));

    expect(await ensureSignedIn()).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('kalıntı anonim oturum kapatılamazsa (ağ yok) yine null döner, fırlatmaz', async () => {
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));
    mockSignOut.mockRejectedValue(new Error('ağ yok'));

    // No uid either way, so nothing is pushed.
    await expect(ensureSignedIn()).resolves.toBeNull();
  });

  it('kalıntı anonim oturum, sahiplik damgasına DOKUNMAZ', async () => {
    // Erasing it would make the next real sign-in look "fresh" and the push
    // would hit RLS on the old anonymous rows; kept, it's an account switch.
    await AsyncStorage.setItem(OWNER_UID_KEY, 'anon-kalinti');
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));

    await ensureSignedIn();

    expect(await AsyncStorage.getItem(OWNER_UID_KEY)).toBe('anon-kalinti');
  });
});

describe('çıkış', () => {
  it('signOutAccount oturumu kapatır; sonrasında senkron devre dışı kalır', async () => {
    await signOutAccount();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(await ensureSignedIn()).toBeNull();
  });

  it('signOutAccount çıkış hatasını fırlatır (çağıran haberdar olsun)', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('ağ yok') });
    await expect(signOutAccount()).rejects.toThrow('ağ yok');
  });
});

describe('hesap silme', () => {
  it('RPC çağırır, sahiplik damgasını siler, yerel oturumu kapatır', async () => {
    await AsyncStorage.setItem(OWNER_UID_KEY, 'hesap-1');

    await deleteAccountAndData();

    expect(mockRpc).toHaveBeenCalledWith('delete_account');
    expect(await AsyncStorage.getItem(OWNER_UID_KEY)).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(await ensureSignedIn()).toBeNull();
  });

  it('RPC hata verirse fırlatır; damga ve oturum korunur (hesap duruyor)', async () => {
    await AsyncStorage.setItem(OWNER_UID_KEY, 'hesap-1');
    mockRpc.mockResolvedValue({ error: new Error('function not found') });

    await expect(deleteAccountAndData()).rejects.toThrow('function not found');

    expect(await AsyncStorage.getItem(OWNER_UID_KEY)).toBe('hesap-1');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('silme başarılı ama yerel signOut fırlatırsa YUTULUR', async () => {
    mockSignOut.mockRejectedValue(new Error('token geçersiz'));

    await expect(deleteAccountAndData()).resolves.toBeUndefined();
    expect(await AsyncStorage.getItem(OWNER_UID_KEY)).toBeNull();
  });
});
