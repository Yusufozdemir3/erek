// Theme (light/dark) context. User preference: 'light' | 'dark' | 'system'
// (stored in AsyncStorage). When 'system' is selected, the phone's theme
// (useColorScheme) is followed. Screens/components get the active palette +
// shared styles via useTheme(). ThemeProvider sits at the VERY OUTSIDE of the
// tree so every surface (loading screen, modals, status bar) follows the theme.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_THEMES,
  type AccentKey,
  blackColors,
  type Colors,
  DEFAULT_ACCENT,
  darkColors,
  lightColors,
  makeShared,
} from '@/ui/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
// Dark theme style: 'warm' = warm ink (default), 'black' = full black (AMOLED).
// Only makes a visible difference while dark theme is active.
export type DarkStyle = 'warm' | 'black';
const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

interface ThemeApi {
  colors: Colors;
  shared: ReturnType<typeof makeShared>;
  scheme: 'light' | 'dark'; // the theme actually applied
  mode: ThemeMode;          // user preference
  setMode: (m: ThemeMode) => void;
  accent: AccentKey;        // accent (brand) color preference
  setAccent: (a: AccentKey) => void;
  darkStyle: DarkStyle;     // dark theme's style (warm / full black)
  setDarkStyle: (s: DarkStyle) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme yalnızca <ThemeProvider> içinde kullanılabilir.');
  return v;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [darkStyle, setDarkStyleState] = useState<DarkStyle>('warm');

  // Load saved preferences once.
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
    AsyncStorage.getItem(ACCENT_KEY).then((v) => {
      if (v && v in ACCENT_THEMES) setAccentState(v as AccentKey);
    });
    AsyncStorage.getItem(DARK_STYLE_KEY).then((v) => {
      if (v === 'warm' || v === 'black') setDarkStyleState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  };

  const setAccent = (a: AccentKey) => {
    setAccentState(a);
    AsyncStorage.setItem(ACCENT_KEY, a).catch(() => {});
  };

  const setDarkStyle = (s: DarkStyle) => {
    setDarkStyleState(s);
    AsyncStorage.setItem(DARK_STYLE_KEY, s).catch(() => {});
  };

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const base = scheme === 'dark' ? (darkStyle === 'black' ? blackColors : darkColors) : lightColors;
  // The accent color only overrides primary/primarySoft; all remaining tones
  // (background/text/done/danger etc.) come from the active light/dark theme.
  const accentPalette = ACCENT_THEMES[accent][scheme];
  const colors: Colors = useMemo(
    () => ({ ...base, primary: accentPalette.primary, primarySoft: accentPalette.primarySoft }),
    [base, accentPalette]
  );
  const shared = useMemo(() => makeShared(colors), [colors]);

  const value = useMemo<ThemeApi>(
    () => ({ colors, shared, scheme, mode, setMode, accent, setAccent, darkStyle, setDarkStyle }),
    [colors, shared, scheme, mode, accent, darkStyle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
