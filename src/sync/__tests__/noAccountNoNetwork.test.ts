// Uygulamanın en temel sözü (gizlilik politikası §1, giriş ekranı, Gizlilik
// sayfası): hesap yokken bizim sunucumuza HİÇBİR istek gitmez. Burada açılışta
// ve her öne gelişte çalışan iki yol denetlenir: eşitleme ve bildirim kaydı.
// Sunucu istemcisinin her kapısı (tablo, RPC, Edge Function) izlenir.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { userRepo } from '../../db/repositories/userRepo';
import { habitRepo } from '../../db/repositories/habitRepo';
import { taskRepo } from '../../db/repositories/taskRepo';
import { resetTestDb } from '../../test/dbTestUtils';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockInvoke = jest.fn();
const mockGetSession = jest.fn();

jest.mock('../supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { getSession: () => mockGetSession(), signOut: jest.fn(async () => ({ error: null })) },
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'p' } } } } }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]' })),
}));

import { runSync } from '../syncEngine';
import { syncPushRegistration } from '@/lib/pushRegistration';

const anyNetwork = () => mockFrom.mock.calls.length + mockRpc.mock.calls.length + mockInvoke.mock.calls.length;

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

describe('hesap yokken sunucuya istek gitmez', () => {
  it('eşitleme: veri varken bile tek bir tablo/RPC çağrısı yapılmaz', async () => {
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });
    taskRepo.create({ user_id: user.id, title: 'Süt al' });

    const result = await runSync(user.id);

    expect(result.status).toBe('disabled');
    expect(anyNetwork()).toBe(0);
  });

  it('bildirim kaydı: izin ve anahtar olsa bile hesapsız kayıt yapılmaz', async () => {
    await syncPushRegistration(null, 'tr');
    expect(anyNetwork()).toBe(0);
  });

  it('eski oturumdan kalan anonim oturum da veri göndermez', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'anon', is_anonymous: true } } } });
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });

    const result = await runSync(user.id);

    expect(result.status).toBe('disabled');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('karşılaştırma: hesap varken eşitleme gerçekten sunucuya gider (test boşa geçmiyor)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'real-uid', is_anonymous: false } } } });
    mockFrom.mockImplementation(() => {
      const q: any = {
        upsert: async () => ({ error: null }),
        select: () => q,
        gt: () => q,
        order: () => q,
        range: async () => ({ data: [], error: null }),
        in: async () => ({ data: [], error: null }),
        eq: () => q,
      };
      return q;
    });
    const user = userRepo.getOrCreateLocal();
    habitRepo.create({ user_id: user.id, title: 'Su iç' });

    await runSync(user.id);

    expect(mockFrom).toHaveBeenCalled();
  });
});
