// Expo Router root layout. Wraps every screen with AppDataProvider:
// this way the data layer (SQLite + anonymous user) is ready before the first render.

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

// expo-notifications logs a warning in Expo Go that push (remote) notifications
// aren't supported. Our usage is LOCAL notifications only; those work fine in
// Expo Go. We suppress these expected warnings to keep the console clean.
// (The real production solution is a development build.)
LogBox.ignoreLogs([
  'expo-notifications: Push notifications (remote notifications) functionality',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

// Theme-aware shell: status bar + Stack background/header colors follow the
// active palette. Rendered INSIDE ThemeProvider since it uses useTheme.
//
// CRITICAL: expo-router's inner React Navigation container picks its theme
// background from the SYSTEM color scheme. That's why, when the phone was dark
// but the app preference was light, the navigation shell's background (screen
// transition backdrop, modal backdrop) stayed dark. We fix this by binding
// NavThemeProvider to our own scheme.
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
        {/* The "account" ROUTE WAS REMOVED (the screen still lives at
            src/ui/AccountScreen.tsx). Reason: sign-in is now Google-only (see
            ui/LoginScreen.tsx) and nothing linked to that screen anymore — but
            as long as it stayed under app/ the route was still LIVE and could
            be opened with `habitapp://account`. It let you open a SECOND
            account with email+password, ran sync directly via runSync
            (bypassing AppData.syncNow) — meaning the "last backup" timestamp
            and error state never updated — and never ran the account-switch
            check (classifySignIn), so the RLS lockout we'd already fixed
            could be reproduced again. */}
        <Stack.Screen name="profile" options={{ headerShown: true, title: t('profile.title'), presentation: 'modal' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: t('notifications.title'), presentation: 'modal' }} />
        <Stack.Screen
          name="login"
          options={{ headerShown: true, title: t('login.title'), presentation: 'modal' }}
        />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="goal/[id]" />
      </Stack>
      {/* Onboarding shown once on first launch (manages its own flag). */}
      <OnboardingGate />
      {/* Login screen shown once after onboarding — skippable, manages its
          own flag, and never renders at all while ACCOUNTS_ENABLED is off. */}
      <LoginGate />
    </NavThemeProvider>
  );
}

function RootLayout() {
  // ICON FONTS: @expo/vector-icons icons (Feather/Ionicons) load glyph fonts
  // via expo-asset; until they're ready, icons render as an empty <Text/>.
  // We preload the fonts once at startup to avoid the "iconless" flash on the
  // first render. (The truly critical dependency is expo-file-system — without
  // it, expo-asset can't download in a RELEASE build and ALL icons would come
  // out blank; see package.json.)
  useFonts({ ...Feather.font, ...Ionicons.font });

  // Notification handler and Android channel are set up once (doesn't request
  // permission). The haptics preference is also cached here (haptics.ts is
  // outside React).
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

// If Sentry isn't configured (no DSN), this wrapper stays a harmless pass-through
// layer — it reports nothing.
export default Sentry.wrap(RootLayout);
