// Uygulama kilidi: kayıtlı ayar okunamazsa kapak sonsuza dek kalmaz.
// Ayrı dosyada: sahte zamanlayıcı, diğer kilit testlerinin Date/AppState taklitleriyle karışmasın.

import { Modal } from 'react-native';
import { act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppLockGate } from '@/ui/AppLockGate';
import { READ_TIMEOUT_MS } from '@/ui/useAppLock';
import { renderUI } from '@/test/renderWithProviders';

jest.setTimeout(30000);

const mockAuth = jest.fn();
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: async () => 1,
  authenticateAsync: (...a: unknown[]) => mockAuth(...a),
}));

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('asla dönmeyen depo: okunana kadar kapak, süre dolunca kilit kapalı sayılır', async () => {
  jest.useFakeTimers();
  jest.spyOn(AsyncStorage, 'getItem').mockImplementation(() => new Promise(() => {}));
  const u = await renderUI(<AppLockGate />);
  expect(u.UNSAFE_getByType(Modal).props.visible).toBe(true);

  await act(async () => {
    jest.advanceTimersByTime(READ_TIMEOUT_MS + 500);
  });

  expect(u.UNSAFE_getByType(Modal).props.visible).toBe(false);
  expect(mockAuth).not.toHaveBeenCalled();
});
