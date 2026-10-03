// Cihaz push anahtarının yaşam döngüsü. En önemli söz: çıkış yapılan hesabın
// hatırlatmaları bu telefona gelmeye devam etmez — çevrimdışı çıkışta bile
// (bekleyen serbest bırakma, oturumsuz yeniden denenir).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { nudgeRecipientUid } from '@/lib/nudgeRecipient';
import {
  forgetPushToken,
  registerPushToken,
  releasePushTokenForSignOut,
  retryPendingRelease,
  unregisterPushToken,
} from '../pushTokens';

const mockRpc = jest.fn();
jest.mock('../supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const DAY = 24 * 3600 * 1000;

const rpcCalls = (name: string) => mockRpc.mock.calls.filter((c) => c[0] === name);

beforeEach(async () => {
  jest.useRealTimers();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  await AsyncStorage.clear();
  await forgetPushToken();
});

describe('registerPushToken', () => {
  it('anahtarı oturumdaki hesaba dille kaydeder ve alıcıyı ayarlar', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    expect(mockRpc).toHaveBeenCalledWith('register_push_token', { p_token: TOKEN, p_locale: 'tr' });
    expect(nudgeRecipientUid()).toBe('u1');
  });

  it('aynı anahtar/hesap/dil bir hafta içinde yeniden gönderilmez', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await registerPushToken(TOKEN, 'u1', 'tr', 1000 + DAY);
    expect(rpcCalls('register_push_token')).toHaveLength(1);
  });

  it('bir hafta sonra tazelenir; hesap ya da dil değişince hemen yeniden kaydeder', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await registerPushToken(TOKEN, 'u1', 'tr', 1000 + 8 * DAY);
    await registerPushToken(TOKEN, 'u2', 'tr', 1000 + 8 * DAY);
    await registerPushToken(TOKEN, 'u2', 'de', 1000 + 8 * DAY);
    expect(rpcCalls('register_push_token')).toHaveLength(4);
    expect(nudgeRecipientUid()).toBe('u2');
  });

  it('sunucu reddederse kaydedilmiş sayılmaz; sonraki seferde yeniden dener', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    expect(rpcCalls('register_push_token')).toHaveLength(2);
  });

  it('aynı telefon anahtarı yeni hesaba geçince eski hesabın bekleyen serbest bırakması iptal olur', async () => {
    // u1 çevrimdışı çıkış yaptı: anahtar serbest bırakılmayı bekliyor.
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    mockRpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    await releasePushTokenForSignOut();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBe(TOKEN);
    // u2 aynı telefonda girdi: anahtar sunucuda u2'ye taşındı.
    await registerPushToken(TOKEN, 'u2', 'tr', 2000);
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBeNull();
    // Artık yeniden deneme u2'nin kaydını SİLMEMELİ.
    mockRpc.mockClear();
    await retryPendingRelease();
    expect(rpcCalls('release_push_token')).toHaveLength(0);
  });
});

describe('releasePushTokenForSignOut', () => {
  it('çıkışta anahtarı serbest bırakır ve alıcıyı sıfırlar', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await releasePushTokenForSignOut();
    expect(mockRpc).toHaveBeenCalledWith('release_push_token', { p_token: TOKEN });
    expect(nudgeRecipientUid()).toBeNull();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBeNull();
  });

  it('kayıtlı anahtar yoksa sunucuya gitmez', async () => {
    await releasePushTokenForSignOut();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('çevrimdışı çıkış: anahtar bekleyene yazılır, sonra oturumsuz yeniden denenir', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    mockRpc.mockResolvedValueOnce({ error: { message: 'offline' } });
    await releasePushTokenForSignOut();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBe(TOKEN);

    mockRpc.mockResolvedValueOnce({ error: { message: 'still offline' } });
    await retryPendingRelease();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBe(TOKEN);

    await retryPendingRelease();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBeNull();
    expect(rpcCalls('release_push_token')).toHaveLength(3);
  });

  it('cevap vermeyen sunucu çıkışı kilitlemez: 5 sn sonra bekleyene yazılır', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    jest.useFakeTimers();
    mockRpc.mockImplementationOnce(() => new Promise(() => {}));
    const done = releasePushTokenForSignOut();
    await jest.advanceTimersByTimeAsync(5000);
    await done;
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBe(TOKEN);
  });

  it('istisna fırlatan çağrı da bekleyene düşer', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    mockRpc.mockRejectedValueOnce(new Error('network'));
    await releasePushTokenForSignOut();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBe(TOKEN);
  });
});

describe('unregisterPushToken / forgetPushToken', () => {
  it('bildirim izni kalkınca anahtar bırakılır ama alıcı aynı kalır', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await unregisterPushToken();
    expect(mockRpc).toHaveBeenCalledWith('release_push_token', { p_token: TOKEN });
    expect(nudgeRecipientUid()).toBe('u1');
    // İzin geri gelince yeniden kaydedilir (önbellek temizlendi).
    await registerPushToken(TOKEN, 'u1', 'tr', 2000);
    expect(rpcCalls('register_push_token')).toHaveLength(2);
  });

  it('hesap silinince (sunucu zaten sildi) yerel kayıtlar temizlenir, sunucuya gidilmez', async () => {
    await registerPushToken(TOKEN, 'u1', 'tr', 1000);
    await AsyncStorage.setItem('push:pendingRelease', 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]');
    mockRpc.mockClear();
    await forgetPushToken();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(nudgeRecipientUid()).toBeNull();
    expect(await AsyncStorage.getItem('push:registered')).toBeNull();
    expect(await AsyncStorage.getItem('push:pendingRelease')).toBeNull();
  });
});
