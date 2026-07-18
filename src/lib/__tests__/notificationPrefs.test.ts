// notificationPrefs testleri — özellikle 'sound' → 'sound' + 'vibration' ayrımının
// GERİYE UYUMU: eskiden tek 'notif:sound' anahtarı hem sesi hem titreşimi yönetiyordu.
// 'notif:vibration' hiç yazılmamışsa titreşim eski sound değerini miras almalı ki
// combined'ı kapatmış kullanıcıda titreşim de kapalı gelsin.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationPrefs, setCustomSound, setNotificationPref } from '../notificationPrefs';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getNotificationPrefs', () => {
  it('hiçbir tercih yazılmamışsa hepsi varsayılan (açık)', async () => {
    const p = await getNotificationPrefs();
    expect(p).toEqual({
      enabled: true,
      habitReminders: true,
      taskReminders: true,
      goalReminders: true,
      timerDone: true,
      sound: true,
      vibration: true,
      customSoundUri: null,
      customSoundName: null,
    });
  });

  it('vibration yazılmamış + eski sound=kapalı ise titreşim de kapalı gelir', async () => {
    await AsyncStorage.setItem('notif:sound', '0'); // eski combined-off kullanıcısı
    const p = await getNotificationPrefs();
    expect(p.sound).toBe(false);
    expect(p.vibration).toBe(false); // miras alındı
  });

  it('vibration açıkça yazılmışsa sound’dan bağımsızdır', async () => {
    await setNotificationPref('sound', false);
    await setNotificationPref('vibration', true);
    const p = await getNotificationPrefs();
    expect(p.sound).toBe(false);
    expect(p.vibration).toBe(true);
  });
});

describe('setCustomSound', () => {
  it('uri+ad kaydeder ve geri okunur', async () => {
    await setCustomSound('content://media/1', 'Çan');
    const p = await getNotificationPrefs();
    expect(p.customSoundUri).toBe('content://media/1');
    expect(p.customSoundName).toBe('Çan');
  });

  it('uri=null verilince her ikisi de temizlenir (sistem varsayılanına dönüş)', async () => {
    await setCustomSound('content://media/1', 'Çan');
    await setCustomSound(null, null);
    const p = await getNotificationPrefs();
    expect(p.customSoundUri).toBeNull();
    expect(p.customSoundName).toBeNull();
  });
});
