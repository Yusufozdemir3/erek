// Language context: 'tr' | 'en' | 'de' (AsyncStorage), else the device
// language if supported, else English. Screens use useI18n().t(key, params).
// Sits outside the navigation tree so modals follow the language too.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { type Lang, SUPPORTED_LANGS, translate } from '@/i18n/translations';

const LANG_KEY = 'i18n:lang';

interface I18nApi {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nApi | null>(null);

export function useI18n(): I18nApi {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n yalnızca <I18nProvider> içinde kullanılabilir.');
  return v;
}

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    if (code && (SUPPORTED_LANGS as string[]).includes(code)) return code as Lang;
  } catch {}
  return 'en';
}

// For non-React modules: the stored language, else the device's.
export async function getStoredLang(): Promise<Lang> {
  try {
    const v = await AsyncStorage.getItem(LANG_KEY);
    if (v && (SUPPORTED_LANGS as string[]).includes(v)) return v as Lang;
  } catch {}
  return deviceLang();
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLang);

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((v) => {
      if (v && (SUPPORTED_LANGS as string[]).includes(v)) setLangState(v as Lang);
    });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  };

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  }, [lang]);

  const value = useMemo<I18nApi>(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
