// Theme context: 'light' | 'dark' | 'system' (AsyncStorage), plus accent and
// dark style. Sits outermost so every surface (loading screen, modals, status
// bar) follows it. Components use useTheme().

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { effectiveAccent } from '@/plus/plusLogic';
import { useFeaturesUnlocked } from '@/plus/plusStore';
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
// 'warm' (default) or 'black' (AMOLED); dark theme only.
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
  accent: AccentKey; // the accent APPLIED (a Plus one falls back to a free one while locked)
  setAccent: (a: AccentKey) => void;
  darkStyle: DarkStyle;
  setDarkStyle: (s: DarkStyle) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme yalnızca <ThemeProvider> içinde kullanılabilir.');
  return v;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);
  const [darkStyle, setDarkStyleState] = useState<DarkStyle>('warm');
  // The saved choice is kept while locked and returns with Plus.
  const unlocked = useFeaturesUnlocked();
  const appliedAccent = effectiveAccent(accent, unlocked);

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
  // The accent overrides only primary/primarySoft.
  const accentPalette = ACCENT_THEMES[appliedAccent][scheme];
  const colors: Colors = useMemo(
    () => ({ ...base, primary: accentPalette.primary, primarySoft: accentPalette.primarySoft }),
    [base, accentPalette]
  );
  const shared = useMemo(() => makeShared(colors), [colors]);

  const value = useMemo<ThemeApi>(
    () => ({ colors, shared, scheme, mode, setMode, accent: appliedAccent, setAccent, darkStyle, setDarkStyle }),
    [colors, shared, scheme, mode, appliedAccent, darkStyle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
