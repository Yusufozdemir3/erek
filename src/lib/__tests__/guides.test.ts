// Özellik rehberleri: yalnız YENİ kurulumda, sihirbaz bittikten sonra, bir kez kendiliğinden açılır.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { guideSeenKey, hasSeenGuide, markGuideSeen, markNewInstall, NEW_INSTALL_KEY, shouldAutoShowGuide } from '../guides';

beforeEach(async () => {
  await AsyncStorage.clear();
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
