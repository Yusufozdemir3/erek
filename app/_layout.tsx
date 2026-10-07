// Root layout: providers (theme, i18n, data, timer), the screen stack and the
// full-screen gates (setup wizard, login, app lock).

import { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { applyAppFont } from '@/ui/applyFont';
import { fontFamilyFor, type FontChoice } from '@/ui/fontFamily';
import { initFont, useFontChoice } from '@/ui/fontStore';
import { initPlus, startPlusSync } from '@/plus/plusStore';
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
import { AppLockGate } from '@/ui/AppLockGate';
import { PushBridge } from '@/ui/PushBridge';
import { TimerProvider } from '@/ui/TimerProvider';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';
import { I18nProvider, useI18n } from '@/i18n/I18nProvider';
import { ensureAndroidChannel, setNotificationHandler } from '@/lib/notifications';
import { loadHapticsPref } from '@/lib/haptics';
import { Sentry } from '@/lib/sentry';
import { CrashScreen } from '@/ui/CrashScreen';

// Expo Go warns that push isn't supported; reminders are local and work, and
// push (friend nudges) needs a real build anyway.
LogBox.ignoreLogs([
  'expo-notifications: Push notifications (remote notifications) functionality',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

// Status bar and stack colors follow the app's theme. NavThemeProvider gets our
// scheme explicitly: React Navigation would follow the SYSTEM one, leaving dark
// transition backdrops under a light app theme.
// Wrap Text/TextInput once, before anything renders; the chosen typeface is read live.
applyAppFont();

function navFonts(choice: FontChoice): Theme['fonts'] {
  const f = (weight: string) => ({ fontFamily: fontFamilyFor(choice, weight) ?? 'sans-serif', fontWeight: 'normal' as const });
  return { regular: f('400'), medium: f('500'), bold: f('700'), heavy: f('800') };
}

function ThemedStack() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const fontChoice = useFontChoice();
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
    // Tab labels and headers get an explicit fontFamily from the nav theme,
    // which applyAppFont leaves alone — so set the chosen one here.
    fonts: fontChoice === 'system' ? base.fonts : navFonts(fontChoice),
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
        <Stack.Screen name="profile" options={{ headerShown: true, title: t('profile.title'), presentation: 'modal' }} />
        <Stack.Screen name="appearance" options={{ headerShown: true, title: t('profile.appearance'), presentation: 'modal' }} />
        <Stack.Screen name="account-sync" options={{ headerShown: true, title: t('profile.accountSync'), presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title'), presentation: 'modal' }} />
        <Stack.Screen name="friends" options={{ headerShown: true, title: t('friends.title'), presentation: 'modal' }} />
        <Stack.Screen name="privacy" options={{ headerShown: true, title: t('profile.privacy'), presentation: 'modal' }} />
        <Stack.Screen name="review" options={{ headerShown: true, title: t('profile.review'), presentation: 'modal' }} />
        <Stack.Screen name="data" options={{ headerShown: true, title: t('profile.data'), presentation: 'modal' }} />
        <Stack.Screen name="guides" options={{ headerShown: true, title: t('guides.title'), presentation: 'modal' }} />
        <Stack.Screen name="plus" options={{ headerShown: true, title: t('plus.title'), presentation: 'modal' }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: t('profile.about'), presentation: 'modal' }} />
        <Stack.Screen name="setup" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: true, title: t('login.title'), presentation: 'modal' }}
        />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="shared-habit/[id]" />
        <Stack.Screen name="goal/[id]" />
        <Stack.Screen name="shared-goal/[id]" />
      </Stack>
      <OnboardingGate />
      <LoginGate />
      <PushBridge />
      {/* Covers everything, open sheets included, while locked. */}
      <AppLockGate />
    </NavThemeProvider>
  );
}

function RootLayout() {
  // Icon fonts are preloaded so the first render isn't iconless (they come via
  // expo-asset, which needs expo-file-system in release builds).
  useFonts({ ...Feather.font, ...Ionicons.font });

  // The chosen typeface loads before the first render (text drawn earlier
  // would stay in the system font). initFont never rejects.
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    // Entitlements first (cache only, no network): the typeface that applies depends on them.
    initPlus()
      .then(initFont)
      .finally(() => {
        setFontReady(true);
        startPlusSync(); // then follow the store (RevenueCat) in the background
      });
  }, []);

  // Once: notification handler and channels (no permission prompt), haptics pref.
  useEffect(() => {
    setNotificationHandler();
    ensureAndroidChannel();
    loadHapticsPref().catch(() => {});
  }, []);

  if (!fontReady) return null;

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

// A screen crashing while rendering shows this (outside our providers).
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <CrashScreen error={error} retry={retry} report={(e) => Sentry.captureException(e)} />;
}

// A pass-through without a Sentry DSN.
export default Sentry.wrap(RootLayout);
