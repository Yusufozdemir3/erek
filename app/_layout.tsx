// Expo Router kök layout'u. Tüm ekranların etrafını AppDataProvider sarar:
// böylece veri katmanı (SQLite + anonim kullanıcı) ilk render'dan önce hazır olur.

import { Stack } from 'expo-router';
import { AppDataProvider } from '@/ui/AppData';

export default function RootLayout() {
  return (
    <AppDataProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AppDataProvider>
  );
}
