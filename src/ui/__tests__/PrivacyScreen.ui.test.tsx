// Gizlilik ve çevrimdışı sayfası: telefonun gerçek durumuna göre doğru cümleler.

import { Linking } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import PrivacyScreen from '../../../app/privacy';
import { renderUI } from '@/test/renderWithProviders';
import { PRIVACY_POLICY_URL } from '@/config';

let mockAuthUser: { id: string; email: string | null; isAnonymous: boolean } | null = null;
const mockMic = jest.fn();
const mockConsent = jest.fn();
const mockNotif = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, []) };
});
jest.mock('@/ui/AppData', () => ({ useAppData: () => ({ authUser: mockAuthUser }) }));
jest.mock('@/lib/voice', () => ({ getMicPermission: (...a: unknown[]) => mockMic(...a) }));
jest.mock('@/lib/voicePrefs', () => ({ getOnlineConsent: (...a: unknown[]) => mockConsent(...a) }));
jest.mock('@/lib/notifications', () => ({ notificationPermission: (...a: unknown[]) => mockNotif(...a) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthUser = null;
  mockMic.mockResolvedValue('ask');
  mockConsent.mockResolvedValue(false);
  mockNotif.mockResolvedValue({ granted: false, canAskAgain: true });
});

describe('PrivacyScreen', () => {
  it('hesapsız, izinsiz: veriler telefonda, mikrofon ve bildirim kapalı', async () => {
    const u = await renderUI(<PrivacyScreen />);
    expect(await u.findByText(/Yalnızca bu telefonda duruyor/)).toBeTruthy();
    expect(u.getByText(/Mikrofon izni verilmedi/)).toBeTruthy();
    expect(u.getByText(/Bildirim izni yok/)).toBeTruthy();
    expect(u.getByText(/en fazla 30 dakikada bir/)).toBeTruthy(); // reklam dürüstçe yazılı
    expect(u.getByText(/içeriğini taşımayan teknik bir rapor/)).toBeTruthy();
  });

  it('hesaplı, izinli, çevrim içi onaylı: hesap e-postası, Google üzerinden ses, arkadaş bildirimi', async () => {
    mockAuthUser = { id: 'u1', email: 'ada@example.com', isAnonymous: false };
    mockMic.mockResolvedValue('granted');
    mockConsent.mockResolvedValue(true);
    mockNotif.mockResolvedValue({ granted: true, canAskAgain: true });
    const u = await renderUI(<PrivacyScreen />);
    expect(await u.findByText(/Hesabına yedekleniyor \(ada@example\.com\)/)).toBeTruthy();
    await waitFor(() => expect(u.getByText(/çevrim içi tanımaya izin verdin/)).toBeTruthy());
    expect(u.getByText(/Arkadaş hatırlatmaları için/)).toBeTruthy();
  });

  it('mikrofon izinli ama çevrim içi onay yoksa: ses telefondan çıkmaz', async () => {
    mockMic.mockResolvedValue('granted');
    const u = await renderUI(<PrivacyScreen />);
    expect(await u.findByText(/ses telefondan çıkmaz/)).toBeTruthy();
  });

  it('mikrofon modülü hata verirse sayfa yine açılır (izin yok sayılır)', async () => {
    mockMic.mockRejectedValue(new Error('no native module'));
    const u = await renderUI(<PrivacyScreen />);
    expect(await u.findByText(/Mikrofon izni verilmedi/)).toBeTruthy();
  });

  it('internetsiz çalışanlar ve internet isteyenler listelenir', async () => {
    const u = await renderUI(<PrivacyScreen />);
    expect(await u.findByText('İnternet olmadan çalışır')).toBeTruthy();
    expect(u.getByText('Hatırlatmalar ve bildirimler')).toBeTruthy();
    expect(u.getByText('İnternet ister')).toBeTruthy();
    expect(u.getByText('Reklamlar (internet yoksa gösterilmez)')).toBeTruthy();
  });

  it('gizlilik politikası bağlantısı doğru adresi açar', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const u = await renderUI(<PrivacyScreen />);
    fireEvent.press(await u.findByText('Gizlilik politikasını aç'));
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});
