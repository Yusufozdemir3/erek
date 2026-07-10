// Expo Router kök layout'u. Tüm ekranların etrafını AppDataProvider sarar:
// böylece veri katmanı (SQLite + anonim kullanıcı) ilk render'dan önce hazır olur.

import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '@/ui/AppData';
import { OnboardingGate } from '@/ui/Onboarding';
import { TimerProvider } from '@/ui/TimerProvider';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';
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

// Tema'ya bağlı kabuk: durum çubuğu + Stack zemini/başlık renkleri aktif palete
// göre. useTheme kullandığından ThemeProvider İÇİNDE render edilir.
function ThemedStack() {
  const { colors, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="account" options={{ headerShown: true, title: 'Hesap', presentation: 'modal' }} />
        <Stack.Screen name="profile" options={{ headerShown: true, title: 'Profil', presentation: 'modal' }} />
        <Stack.Screen name="habit/[id]" />
      </Stack>
      {/* İlk açılışta bir kez gösterilen tanıtım (kendi bayrağını yönetir). */}
      <OnboardingGate />
    </>
  );
}

function RootLayout() {
  // Bildirim handler'ı ve Android kanalı bir kez kurulur (izin istemez).
  useEffect(() => {
    setNotificationHandler();
    ensureAndroidChannel();
  }, []);

  return (
    <ThemeProvider>
      <AppDataProvider>
        <TimerProvider>
          <ThemedStack />
        </TimerProvider>
      </AppDataProvider>
    </ThemeProvider>
  );
}

// Sentry yapılandırılmadıysa (DSN yok) bu sarmalayıcı zararsız bir geçiş
// katmanı olarak kalır — hiçbir şey raporlamaz.
export default Sentry.wrap(RootLayout);
