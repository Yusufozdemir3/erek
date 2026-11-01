// The app theme as the widgets need it, read outside React (ThemeProvider's
// storage keys): the JS widgets get the scheme in effect now, the native ones
// both palettes plus the mode, so they can follow the phone's dark mode alone.

import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_THEMES,
  DEFAULT_ACCENT,
  blackColors,
  darkColors,
  lightColors,
  type AccentKey,
  type Colors,
} from '@/ui/theme';

const MODE_KEY = 'theme:mode';
const ACCENT_KEY = 'theme:accent';
const DARK_STYLE_KEY = 'theme:darkStyle';

export interface WidgetThemeSettings {
  mode: 'light' | 'dark' | 'system';
  accent: AccentKey;
  darkStyle: 'warm' | 'black';
}

export async function readWidgetTheme(): Promise<WidgetThemeSettings> {
  const [mode, accentRaw, darkStyle] = await Promise.all([
    AsyncStorage.getItem(MODE_KEY),
    AsyncStorage.getItem(ACCENT_KEY),
    AsyncStorage.getItem(DARK_STYLE_KEY),
  ]);
  return {
    mode: mode === 'dark' || mode === 'light' ? mode : 'system',
    accent: accentRaw && accentRaw in ACCENT_THEMES ? (accentRaw as AccentKey) : DEFAULT_ACCENT,
    darkStyle: darkStyle === 'black' ? 'black' : 'warm',
  };
}

// The scheme in effect now ('system' resolved through the phone's setting).
export function currentScheme(s: WidgetThemeSettings): 'light' | 'dark' {
  if (s.mode !== 'system') return s.mode;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

// The app's colors for one scheme, with the accent applied (as ThemeProvider does).
export function themeColors(s: WidgetThemeSettings, scheme: 'light' | 'dark'): Colors {
  const base = scheme === 'dark' ? (s.darkStyle === 'black' ? blackColors : darkColors) : lightColors;
  const accent = ACCENT_THEMES[s.accent][scheme];
  return { ...base, primary: accent.primary, primarySoft: accent.primarySoft };
}
