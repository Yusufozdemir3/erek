// Bileşen testleri için ortak render sarmalayıcısı: her bileşen ThemeProvider ve
// I18nProvider bağlamına ihtiyaç duyar (useTheme/useI18n). renderUI, RNTL render'ı
// bu sağlayıcılarla sarar ve sağlayıcıların açılıştaki asenkron tercih okumasını
// (AsyncStorage.getItem) boşaltır ki testler "act" uyarısı almadan sürsün.

import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/ui/ThemeProvider';
import { I18nProvider } from '@/i18n/I18nProvider';

export async function renderUI(ui: ReactElement) {
  const utils = render(
    <ThemeProvider>
      <I18nProvider>{ui}</I18nProvider>
    </ThemeProvider>
  );
  // Sağlayıcıların useEffect içindeki AsyncStorage okuması bir sonraki microtask'ta
  // çözülür; bekleyen setState'i burada boşaltıyoruz.
  await act(async () => {});
  return utils;
}

// Bekleyen microtask'ları (ör. seçici onChange sonrası state) boşaltmak için.
export async function flush() {
  await act(async () => {});
}
