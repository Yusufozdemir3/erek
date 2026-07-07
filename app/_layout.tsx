// Expo Router kök layout'u. Tüm ekranların etrafını AppDataProvider sarar:
// böylece veri katmanı (SQLite + anonim kullanıcı) ilk render'dan önce hazır olur.

import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { AppDataProvider } from '@/ui/AppData';
import { TimerProvider } from '@/ui/TimerProvider';
import { ensureAndroidChannel, setNotificationHandler } from '@/lib/notifications';
import { Sentry } from '@/lib/sentry';

// Expo Go'da expo-notifications, push (remote) bildirimlerinin desteklenmediğine
// dair uyarı basıyor. Bizim kullanımımız yalnızca YEREL hatırlatma; bunlar Expo
// Go'da çalışıyor. Konsolu kirletmemek için bu beklenen uyarıları gizliyoruz.
// (Gerçek prod çözümü development build'tir.)
LogBox.ignoreLogs([
  'expo-notifications: Push notifications (remote notifications) functionality',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

function RootLayout() {
  // Bildirim handler'ı ve Android kanalı bir kez kurulur (izin istemez).
  useEffect(() => {
    setNotificationHandler();
    ensureAndroidChannel();
  }, []);

  return (
    <AppDataProvider>
      <TimerProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="account"
            options={{
              headerShown: true,
              title: 'Hesap',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="profile"
            options={{
              headerShown: true,
              title: 'Profil',
              presentation: 'modal',
            }}
          />
          <Stack.Screen name="habit/[id]" />
        </Stack>
      </TimerProvider>
    </AppDataProvider>
  );
}

// Sentry yapılandırılmadıysa (DSN yok) bu sarmalayıcı zararsız bir geçiş
// katmanı olarak kalır — hiçbir şey raporlamaz.
export default Sentry.wrap(RootLayout);
