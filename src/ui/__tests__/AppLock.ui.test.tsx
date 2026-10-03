// Uygulama kilidi: soğuk açılışta ister, arka plandan uzun dönüşte ister, kısa dönüşte
// istemez; ekran kilidi yoksa kullanıcı kilitlenmez; Gizlilik sayfasındaki anahtar
// önce doğrulatır.

import { Alert, AppState } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppLockGate } from '@/ui/AppLockGate';
import { AppLockCard } from '@/ui/AppLockCard';
import { renderUI } from '@/test/renderWithProviders';
import { isLockEnabled, setLockEnabled } from '@/lib/appLock';
import { LOCK_GRACE_MS } from '@/lib/appLockLogic';

// Loading the screens takes a while when the whole suite runs in parallel.
jest.setTimeout(30000);

const mockLevel = jest.fn();
const mockAuth = jest.fn();
const mockPrevent = jest.fn(async () => {});
const mockAllow = jest.fn(async () => {});

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: () => mockLevel(),
  authenticateAsync: (...a: unknown[]) => mockAuth(...a),
}));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: (...a: unknown[]) => (mockPrevent as any)(...a),
  allowScreenCaptureAsync: (...a: unknown[]) => (mockAllow as any)(...a),
}));

let appStateHandler: ((s: string) => void) | null = null;
const emitState = (s: string) => act(async () => appStateHandler?.(s));

let now = 1_000_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockLevel.mockResolvedValue(1);
  mockAuth.mockResolvedValue({ success: true });
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandler = h;
    return { remove: jest.fn() };
  }) as never);
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('AppLockGate', () => {
  it('kilit kapalıyken hiçbir şey sormaz', async () => {
    await renderUI(<AppLockGate />);
    await waitFor(() => expect(mockPrevent).not.toHaveBeenCalled());
    expect(mockAuth).not.toHaveBeenCalled();
    expect(mockAllow).toHaveBeenCalled(); // güvenlik bayrağı kapalı
  });

  it('kilit açıkken soğuk açılışta doğrulama ister ve başarıyla açılır', async () => {
    await setLockEnabled(true);
    const u = await renderUI(<AppLockGate />);
    await waitFor(() => expect(mockAuth).toHaveBeenCalledTimes(1));
    expect(mockAuth).toHaveBeenCalledWith(expect.objectContaining({ disableDeviceFallback: false }));
    expect(mockPrevent).toHaveBeenCalled(); // son uygulamalar önizlemesi boş
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
  });

  it('doğrulama iptal edilirse kilitli kalır; düğme yeniden dener', async () => {
    await setLockEnabled(true);
    mockAuth.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    const u = await renderUI(<AppLockGate />);
    expect(await u.findByText('Erek kilitli')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Kilidi aç'));
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
    expect(mockAuth).toHaveBeenCalledTimes(2);
  });

  it('kısa süre arka planda kalınca yeniden sormaz; uzun süre kalınca sorar', async () => {
    await setLockEnabled(true);
    const u = await renderUI(<AppLockGate />);
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
    mockAuth.mockClear();

    await emitState('background');
    now += 10_000;
    await emitState('active');
    expect(mockAuth).not.toHaveBeenCalled();

    await emitState('background');
    now += LOCK_GRACE_MS + 1;
    mockAuth.mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    await emitState('active');
    await waitFor(() => expect(mockAuth).toHaveBeenCalledTimes(1));
    expect(await u.findByText('Erek kilitli')).toBeTruthy();
  });

  it('sistem penceresi açıkken gelen arka plan olayı, pencere kapandıktan sonra kilidi yeniden kurmaz', async () => {
    await setLockEnabled(true);
    let resolveAuth: (v: { success: boolean }) => void = () => {};
    mockAuth.mockReturnValueOnce(new Promise((r) => (resolveAuth = r)));
    const u = await renderUI(<AppLockGate />);
    await waitFor(() => expect(mockAuth).toHaveBeenCalledTimes(1));

    await emitState('background'); // doğrulama penceresi açıkken
    now += LOCK_GRACE_MS * 3; // kullanıcı yavaş davrandı
    await act(async () => resolveAuth({ success: true }));
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
    await emitState('active'); // pencere kapandıktan sonra gelen olay

    expect(u.queryByText('Erek kilitli')).toBeNull();
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it('arka plandan önce gelen "active" olayı (gerçek dönüş değil) kilitlemez', async () => {
    await setLockEnabled(true);
    const u = await renderUI(<AppLockGate />);
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
    mockAuth.mockClear();
    now += LOCK_GRACE_MS * 3;
    await emitState('active');
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('telefonda ekran kilidi kalmamışsa kullanıcı kilitlenmez ve kilit kapanır', async () => {
    await setLockEnabled(true);
    mockLevel.mockResolvedValue(0);
    const u = await renderUI(<AppLockGate />);
    await waitFor(() => expect(u.queryByText('Erek kilitli')).toBeNull());
    expect(mockAuth).not.toHaveBeenCalled();
    await waitFor(async () => expect(await isLockEnabled()).toBe(false));
  });

  it('uygulama içinde kilit açılınca o anki kullanıcı kilitlenmez; kapatılınca kilit kalkar', async () => {
    const u = await renderUI(<AppLockGate />);
    await act(async () => setLockEnabled(true));
    expect(u.queryByText('Erek kilitli')).toBeNull();
    expect(mockPrevent).toHaveBeenCalled();
    await act(async () => setLockEnabled(false));
    expect(mockAllow).toHaveBeenCalled();
  });
});

describe('AppLockCard', () => {
  it('açarken önce doğrulatır, başarılıysa kaydeder', async () => {
    const u = await renderUI(<AppLockCard />);
    fireEvent(u.getByLabelText(/ekran kilidini iste/), 'valueChange', true);
    await waitFor(async () => expect(await isLockEnabled()).toBe(true));
    expect(mockAuth).toHaveBeenCalledTimes(1);
  });

  it('doğrulama başarısızsa kilidi AÇMAZ ve söyler', async () => {
    mockAuth.mockResolvedValue({ success: false, error: 'user_cancel' });
    const u = await renderUI(<AppLockCard />);
    fireEvent(u.getByLabelText(/ekran kilidini iste/), 'valueChange', true);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Uygulama kilidi', expect.stringContaining('Doğrulama yapılamadı')));
    expect(await isLockEnabled()).toBe(false);
  });

  it('telefonda ekran kilidi yoksa açılmaz ve ne yapılacağını söyler', async () => {
    mockLevel.mockResolvedValue(0);
    const u = await renderUI(<AppLockCard />);
    fireEvent(u.getByLabelText(/ekran kilidini iste/), 'valueChange', true);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Uygulama kilidi', expect.stringContaining('ekran kilidi')));
    expect(mockAuth).not.toHaveBeenCalled();
    expect(await isLockEnabled()).toBe(false);
  });

  it('kapatmak doğrulama istemez', async () => {
    await setLockEnabled(true);
    const u = await renderUI(<AppLockCard />);
    await waitFor(() => expect(u.getByLabelText(/ekran kilidini iste/).props.value).toBe(true));
    fireEvent(u.getByLabelText(/ekran kilidini iste/), 'valueChange', false);
    await waitFor(async () => expect(await isLockEnabled()).toBe(false));
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('LocalAuthentication modülü yüklü', () => {
    expect(LocalAuthentication.SecurityLevel.NONE).toBe(0);
  });
});
