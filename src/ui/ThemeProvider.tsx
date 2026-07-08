// Tema (açık/koyu) context'i. Kullanıcı tercihi: 'light' | 'dark' | 'system'
// (AsyncStorage'da saklanır). 'system' seçiliyse telefon teması (useColorScheme)
// izlenir. Ekranlar/bileşenler useTheme() ile aktif paleti + ortak stilleri alır.
// ThemeProvider ağacın EN DIŞINDA durur ki her yüzey (yükleme ekranı, modallar,
// durum çubuğu) temaya uysun.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Colors, darkColors, lightColors, makeShared } from '@/ui/theme';

export type ThemeMode = 'light' | 'dark' | 'system';
const MODE_KEY = 'theme:mode';

interface ThemeApi {
  colors: Colors;
  shared: ReturnType<typeof makeShared>;
  scheme: 'light' | 'dark'; // gerçekte uygulanan tema
  mode: ThemeMode;          // kullanıcı tercihi
  setMode: (m: ThemeMode) => void;
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

  // Kayıtlı tercihi bir kez yükle.
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  };

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const shared = useMemo(() => makeShared(colors), [colors]);

  const value = useMemo<ThemeApi>(
    () => ({ colors, shared, scheme, mode, setMode }),
    [colors, shared, scheme, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
