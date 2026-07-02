// auth testleri: "bilerek çıkış" bayrağı (SIGNED_OUT_KEY).
// Çıkıştan sonra ensureSignedIn otomatik anonim oturum AÇMAMALI — açsaydı yeni
// anonim uid buluttaki (eski hesabın uid'sindeki) satırların sahibi olmaz ve
// sonraki her push RLS'e takılırdı. Başarılı giriş/kayıt bayrağı temizler.

import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetSession = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSignOut = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignUp = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInAnonymously: () => mockSignInAnonymously(),
      signOut: () => mockSignOut(),
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signUp: (args: unknown) => mockSignUp(args),
      updateUser: (args: unknown) => mockUpdateUser(args),
    },
  },
}));

// jest.mock'tan SONRA import edilmeli ki taklit devreye girsin.
import {
  ensureSignedIn,
  linkEmailToAnonymous,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
} from '../auth';

const SIGNED_OUT_KEY = 'sync:signedOut';
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
});

describe('ensureSignedIn', () => {
  it('oturum yoksa anonim oturum açar (ilk açılış davranışı)', async () => {
    const uid = await ensureSignedIn();
    expect(uid).toBe('anon-1');
    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('çıkıştan sonra anonim oturum AÇMAZ, null döner', async () => {
    await signOutAccount();
    const uid = await ensureSignedIn();
    expect(uid).toBeNull();
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
  });

  it('bayrak set ama HESAP oturumu varsa: oturumu döner ve bayat bayrağı temizler', async () => {
    await AsyncStorage.setItem(SIGNED_OUT_KEY, '1');
    mockGetSession.mockResolvedValue(sessionOf('hesap-1'));
    expect(await ensureSignedIn()).toBe('hesap-1');
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });

  it('bayrak set ama ANONİM oturum varsa: kalıntı oturumu kapatır, null döner', async () => {
    // Eski sürümün otomatik açtığı anonim oturum ya da çıkış anındaki yarış:
    // bu oturum buluttaki satırların sahibi değildir, kullanılmamalı.
    await AsyncStorage.setItem(SIGNED_OUT_KEY, '1');
    mockGetSession.mockResolvedValue(sessionOf('anon-kalinti', true));

    const uid = await ensureSignedIn();

    expect(uid).toBeNull();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignInAnonymously).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBe('1'); // bayrak kalır
  });
});

describe('çıkış bayrağının yaşam döngüsü', () => {
  it('signOutAccount bayrağı set eder', async () => {
    await signOutAccount();
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBe('1');
  });

  it('signInWithEmail bayrağı temizler; anonim akış geri gelir', async () => {
    await signOutAccount();
    await signInWithEmail('a@b.c', 'parola1');
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBeNull();

    // Oturum yine düşerse (ör. çok sonra token geçersiz) anonim akış çalışır.
    const uid = await ensureSignedIn();
    expect(uid).toBe('anon-1');
  });

  it('linkEmailToAnonymous bayrağı temizler', async () => {
    await AsyncStorage.setItem(SIGNED_OUT_KEY, '1');
    await linkEmailToAnonymous('a@b.c', 'parola1');
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });

  it('onay bekleyen kayıt (oturum yok) bayrağı TEMİZLEMEZ', async () => {
    await signOutAccount();
    const { needsConfirmation } = await signUpWithEmail('a@b.c', 'parola1');
    expect(needsConfirmation).toBe(true);
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBe('1');
  });

  it('oturum açan kayıt bayrağı temizler', async () => {
    await signOutAccount();
    mockSignUp.mockResolvedValue({ data: { session: { user: { id: 'yeni-1' } } }, error: null });
    const { needsConfirmation } = await signUpWithEmail('a@b.c', 'parola1');
    expect(needsConfirmation).toBe(false);
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });

  it('bayrak çıkış denemesinden ÖNCE yazılır (yarış penceresi kapalı); çıkış hata verse de kalır', async () => {
    mockSignOut.mockImplementation(async () => {
      // Çıkış ağda sürerken bayrak çoktan yazılmış olmalı.
      expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBe('1');
      return { error: new Error('ağ yok') };
    });
    await expect(signOutAccount()).rejects.toThrow('ağ yok');
    // Hesap oturumu sürüyorsa ensureSignedIn bayat bayrağı temizleyip oturumu kullanır.
    mockGetSession.mockResolvedValue(sessionOf('hesap-1'));
    expect(await ensureSignedIn()).toBe('hesap-1');
    expect(await AsyncStorage.getItem(SIGNED_OUT_KEY)).toBeNull();
  });
});
