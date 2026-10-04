// Özellik rehberleri: yalnız YENİ kurulumda, sihirbaz bittikten sonra, bir kez kendiliğinden açılır.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  announceGatesClosed,
  guideSeenKey,
  hasSeenGuide,
  markGuideSeen,
  markNewInstall,
  NEW_INSTALL_KEY,
  onGatesClosed,
  shouldAutoShowGuide,
} from '../guides';

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('login:seen', '1'); // giriş ekranı çoktan geçilmiş (varsayılan durum)
});

describe('shouldAutoShowGuide', () => {
  it('eski kullanıcıda (yeni kurulum işareti yok) asla kendiliğinden açılmaz', async () => {
    await AsyncStorage.setItem('onboarding:done', '1');
    expect(await shouldAutoShowGuide('goals')).toBe(false);
  });

  it('yeni kurulumda ama sihirbaz bitmeden açılmaz', async () => {
    await markNewInstall();
    expect(await shouldAutoShowGuide('goals')).toBe(false);
  });

  it('yeni kurulum + sihirbaz bitti + görülmedi → açılır', async () => {
    await markNewInstall();
    await AsyncStorage.setItem('onboarding:done', '1');
    expect(await shouldAutoShowGuide('goals')).toBe(true);
  });

  it('giriş ekranı henüz kapanmadıysa açılmaz (iki tam ekran üst üste binmesin)', async () => {
    await markNewInstall();
    await AsyncStorage.setItem('onboarding:done', '1');
    await AsyncStorage.removeItem('login:seen');
    expect(await shouldAutoShowGuide('goals')).toBe(false);
    await AsyncStorage.setItem('login:seen', '1');
    expect(await shouldAutoShowGuide('goals')).toBe(true);
  });

  it('kapılar kapanınca dinleyenlere haber verilir; aboneliği bırakan duymaz', () => {
    const a = jest.fn();
    const b = jest.fn();
    const offA = onGatesClosed(a);
    onGatesClosed(b)();
    announceGatesClosed();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    announceGatesClosed();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('görüldükten sonra bir daha açılmaz', async () => {
    await markNewInstall();
    await AsyncStorage.setItem('onboarding:done', '1');
    await markGuideSeen('goals');
    expect(await hasSeenGuide('goals')).toBe(true);
    expect(await shouldAutoShowGuide('goals')).toBe(false);
  });

  it('depolama okunamazsa açılmaz (kullanıcıyı bölmez)', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('disk'));
    expect(await shouldAutoShowGuide('goals')).toBe(false);
    jest.restoreAllMocks();
  });

  it('anahtarlar sabit (eski sürümlerle uyum)', () => {
    expect(NEW_INSTALL_KEY).toBe('guide:newInstall');
    expect(guideSeenKey('goals')).toBe('guide:seen:goals');
  });
});
