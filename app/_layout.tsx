// Expo Router kök layout'u. Tüm ekranların etrafını AppDataProvider sarar:
// böylece veri katmanı (SQLite + anonim kullanıcı) ilk render'dan önce hazır olur.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AppDataProvider } from '@/ui/AppData';
import { ensureAndroidChannel, setNotificationHandler } from '@/lib/notifications';

export default function RootLayout() {
  // Bildirim handler'ı ve Android kanalı bir kez kurulur (izin istemez).
  useEffect(() => {
    setNotificationHandler();
    ensureAndroidChannel();
  }, []);

  return (
    <AppDataProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AppDataProvider>
  );
}
