// Expo Router kök layout'u. Tüm ekranların etrafını AppDataProvider sarar:
// böylece veri katmanı (SQLite + anonim kullanıcı) ilk render'dan önce hazır olur.

import { useEffect } from 'react';
import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  ThemeProvider as NavThemeProvider,
  DarkTheme,
  DefaultTheme,
  type Theme,
} from '@react-navigation/native';
import { AppDataProvider } from '@/ui/AppData';
import { LoginGate } from '@/ui/LoginScreen';
import { OnboardingGate } from '@/ui/Onboarding';
import { TimerProvider } from '@/ui/TimerProvider';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { ensureAndroidChannel, setNotificationHandler } from '@/lib/notifications';
import { loadHapticsPref } from '@/lib/haptics';
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
//
// KRİTİK: expo-router içteki React Navigation konteynerinin tema zeminini
// SİSTEM renk şemasından seçer. Bu yüzden telefon koyu, uygulama tercihi açık
// iken navigation kabuğunun arka planı (ekran geçiş zemini, modal fonu) koyu
// kalıyordu. NavThemeProvider'ı kendi şemamıza bağlayarak bunu düzeltiyoruz.
function ThemedStack() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: Theme = {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };
  return (
    <NavThemeProvider value={navTheme}>
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
        <Stack.Screen name="profile" options={{ headerShown: true, title: t('profile.title'), presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title'), presentation: 'modal' }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: true, title: t('login.title'), presentation: 'modal' }}
        />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="goal/[id]" />
      </Stack>
      {/* İlk açılışta bir kez gösterilen tanıtım (kendi bayrağını yönetir). */}
      <OnboardingGate />
      {/* Tanıtımdan sonra bir kez gösterilen giriş ekranı — atlanabilir, kendi
          bayrağını yönetir ve ACCOUNTS_ENABLED kapalıyken hiç çizilmez. */}
      <LoginGate />
    </NavThemeProvider>
  );
}

function RootLayout() {
  // İKON FONTLARI: @expo/vector-icons ikonları (Feather/Ionicons) glif fontlarını
  // expo-asset üzerinden yükler; bunlar hazır olana dek ikon boş <Text/> çizer.
  // Fontları açılışta bir kez ön-yükleyip ilk render'daki "ikonsuz" anı önlüyoruz.
  // (Asıl kritik bağımlılık expo-file-system'dir — o olmadan expo-asset RELEASE
  // build'de indirmeyi yapamaz ve TÜM ikonlar boş çıkardı; bkz. package.json.)
  useFonts({ ...Feather.font, ...Ionicons.font });

  // Bildirim handler'ı ve Android kanalı bir kez kurulur (izin istemez).
  // Titreşim tercihi de burada cache'e alınır (haptics.ts React dışı olduğu için).
  useEffect(() => {
    setNotificationHandler();
    ensureAndroidChannel();
    loadHapticsPref().catch(() => {});
  }, []);

  return (
    <I18nProvider>
      <ThemeProvider>
        <AppDataProvider>
          <TimerProvider>
            <ThemedStack />
          </TimerProvider>
        </AppDataProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

// Sentry yapılandırılmadıysa (DSN yok) bu sarmalayıcı zararsız bir geçiş
// katmanı olarak kalır — hiçbir şey raporlamaz.
export default Sentry.wrap(RootLayout);
