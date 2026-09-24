// notificationPrefs tests — especially the BACKWARD COMPATIBILITY of the
// 'sound' → 'sound' + 'vibration' split: the single 'notif:sound' key used to
// control both sound and vibration. If 'notif:vibration' was never written,
// vibration should inherit the old sound value, so a user who had turned off
// the combined switch also gets vibration off.

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
    await AsyncStorage.setItem('notif:sound', '0'); // an old combined-off user
    const p = await getNotificationPrefs();
    expect(p.sound).toBe(false);
    expect(p.vibration).toBe(false); // inherited
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
