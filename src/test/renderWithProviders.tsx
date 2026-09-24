// Shared render wrapper for component tests: every component needs the
// ThemeProvider and I18nProvider context (useTheme/useI18n). renderUI wraps
// RNTL's render with these providers and flushes the providers' async
// preference read at startup (AsyncStorage.getItem) so tests run without an "act" warning.

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
  // The providers' AsyncStorage read inside useEffect resolves on the next
  // microtask; we flush the pending setState here.
  await act(async () => {});
  return utils;
}

// For flushing pending microtasks (e.g. state after a picker's onChange).
export async function flush() {
  await act(async () => {});
}
