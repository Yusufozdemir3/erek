// auth tests: SYNC ONLY WORKS WITH A SIGNED-IN ACCOUNT.
//
// Until 2026-07-30, ensureSignedIn called signInAnonymously whenever it found
// no session. Once ACCOUNTS_ENABLED was turned on, that meant that even if the
// user dismissed the login screen with "Skip for now", the runSync at startup
// would upload ALL local data to an anonymous cloud account — the opposite of
// what privacy policy §1 and the login screen's promise ('login.localNote') guarantee.
//
// The REAL job of the tests here is to keep that behavior from silently
// coming back: no path should ever call signInAnonymously (the blanket guard in afterEach).

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSignOut = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockUpdateUser = jest.fn();
const mockRpc = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockVerifyOtp = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInAnonymously: () => mockSignInAnonymously(),
      signOut: () => mockSignOut(),
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signUp: (args: unknown) => mockSignUp(args),
      updateUser: (args: unknown) => mockUpdateUser(args),
      resetPasswordForEmail: (email: string) => mockResetPasswordForEmail(email),
      verifyOtp: (args: unknown) => mockVerifyOtp(args),
    },
    rpc: (fn: string) => mockRpc(fn),
  },
}));

// Must be imported AFTER jest.mock so the mock takes effect.
import {
  deleteAccountAndData,
  ensureSignedIn,
  linkEmailToAnonymous,
  requestPasswordReset,
  resetPasswordWithCode,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
} from '../auth';

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
  mockSignInWithPassword.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
  mockUpdateUser.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
  mockResetPasswordForEmail.mockResolvedValue({ error: null });
  mockVerifyOtp.mockResolvedValue({ error: null });
});

// BLANKET GUARD: no test, no path should ever sign in anonymously. This one
// line locks every scenario in this file against the "silent cloud upload"
// regression at once — and stays in effect as new flows get added.
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
    // The session the old version opened automatically. Using it would mean
    // continuing the silent upload we removed.
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));

    expect(await ensureSignedIn()).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('kalıntı anonim oturum kapatılamazsa (ağ yok) yine null döner, fırlatmaz', async () => {
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));
    mockSignOut.mockRejectedValue(new Error('ağ yok'));

    // Even if signing out fails, we still don't return a uid: no push happens, no lasting harm.
    await expect(ensureSignedIn()).resolves.toBeNull();
  });

  it('kalıntı anonim oturum, sahiplik damgasına DOKUNMAZ', async () => {
    // If the marker were erased, the next real sign-in would be classified as
    // "fresh", local rows would try to update cloud rows belonging to the old
    // anonymous uid, and hit RLS. Keeping the marker classifies the sign-in
    // correctly as an "account switch".
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
    // Since the session is gone, ensureSignedIn returns null — no separate flag is needed.
    expect(await ensureSignedIn()).toBeNull();
  });

  it('signOutAccount çıkış hatasını fırlatır (çağıran haberdar olsun)', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('ağ yok') }); // "no network"
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
    // Since the user was deleted server-side, the local sign-out may error with an invalid-token error.
    mockSignOut.mockRejectedValue(new Error('token geçersiz')); // "invalid token"

    await expect(deleteAccountAndData()).resolves.toBeUndefined();
    expect(await AsyncStorage.getItem(OWNER_UID_KEY)).toBeNull();
  });
});

describe('e-posta akışları', () => {
  it('signUpWithEmail: oturum açılmadıysa onay bekliyor demektir', async () => {
    const { needsConfirmation } = await signUpWithEmail('a@b.c', 'parola1');
    expect(needsConfirmation).toBe(true);
  });

  it('signUpWithEmail: oturum açıldıysa onay beklemez', async () => {
    mockSignUp.mockResolvedValue({ data: { session: { user: { id: 'yeni-1' } } }, error: null });
    const { needsConfirmation } = await signUpWithEmail('a@b.c', 'parola1');
    expect(needsConfirmation).toBe(false);
  });

  it('signInWithEmail hatayı fırlatır', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: new Error('Invalid login credentials') });
    await expect(signInWithEmail('a@b.c', 'yanlis')).rejects.toThrow('Invalid login credentials');
  });

  it('linkEmailToAnonymous kalıntı anonim oturumu uid koruyarak hesaba çevirir', async () => {
    await linkEmailToAnonymous('a@b.c', 'parola1');
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'a@b.c', password: 'parola1' });
  });

  it('resetPasswordWithCode: kodu doğrular ve parolayı yeniler', async () => {
    await resetPasswordWithCode('a@b.c', ' 123456 ', 'yeniparola');

    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: 'a@b.c', token: '123456', type: 'recovery' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'yeniparola' });
  });

  it('resetPasswordWithCode: kod geçersizse fırlatır, parola güncellenmez', async () => {
    mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') });

    await expect(resetPasswordWithCode('a@b.c', '000000', 'yeniparola')).rejects.toThrow();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("requestPasswordReset e-postayı Supabase'e iletir", async () => {
    await requestPasswordReset('a@b.c');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@b.c');
  });
});
