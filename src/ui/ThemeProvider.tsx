// Tema (açık/koyu) context'i. Kullanıcı tercihi: 'light' | 'dark' | 'system'
// (AsyncStorage'da saklanır). 'system' seçiliyse telefon teması (useColorScheme)
// izlenir. Ekranlar/bileşenler useTheme() ile aktif paleti + ortak stilleri alır.
// ThemeProvider ağacın EN DIŞINDA durur ki her yüzey (yükleme ekranı, modallar,
// durum çubuğu) temaya uysun.

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
// Koyu temanın stili: 'warm' = sıcak mürekkep (varsayılan), 'black' = tam siyah
// (AMOLED). Yalnız koyu tema aktifken görünür bir fark yaratır.
export type DarkStyle = 'warm' | 'black';
const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

interface ThemeApi {
  colors: Colors;
  shared: ReturnType<typeof makeShared>;
  scheme: 'light' | 'dark'; // gerçekte uygulanan tema
  mode: ThemeMode;          // kullanıcı tercihi
  setMode: (m: ThemeMode) => void;
  accent: AccentKey;        // vurgu (marka) rengi tercihi
  setAccent: (a: AccentKey) => void;
  darkStyle: DarkStyle;     // koyu temanın stili (sıcak / tam siyah)
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

  // Kayıtlı tercihleri bir kez yükle.
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
  // Vurgu rengi yalnızca primary/primarySoft'u geçersiz kılar; geri kalan tüm
  // tonlar (zemin/metin/done/danger vb.) aktif açık/koyu temadan gelir.
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
