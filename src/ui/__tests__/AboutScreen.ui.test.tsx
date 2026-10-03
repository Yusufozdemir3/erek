// Hakkında ve destek: sürüm, geri bildirim taslağı (mail uygulaması yoksa adres), gizlilik bağlantıları.

import { Alert, Linking } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AboutScreen from '../../../app/about';
import { renderUI } from '@/test/renderWithProviders';
import { PRIVACY_POLICY_URL } from '@/config';
import { CONTACT_EMAIL } from '@/lib/feedbackMail';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '9.9.9' } } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('AboutScreen', () => {
  it('sürümü gösterir', async () => {
    const u = await renderUI(<AboutScreen />);
    expect(u.getByText('Sürüm 9.9.9')).toBeTruthy();
  });

  it('geri bildirim: teknik altbilgili mailto açılır', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const u = await renderUI(<AboutScreen />);
    fireEvent.press(u.getByLabelText('Geri bildirim gönder'));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = open.mock.calls[0][0] as string;
    expect(url.startsWith(`mailto:${CONTACT_EMAIL}`)).toBe(true);
    expect(decodeURIComponent(url)).toContain('Erek 9.9.9 · Android');
  });

  it('mail uygulaması yoksa adresi söyler', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const u = await renderUI(<AboutScreen />);
    fireEvent.press(u.getByLabelText('Geri bildirim gönder'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Geri bildirim gönder', expect.stringContaining(CONTACT_EMAIL))
    );
  });

  it('gizlilik sayfasına gider, politikayı dışarıda açar', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const u = await renderUI(<AboutScreen />);
    fireEvent.press(u.getByLabelText('Gizlilik ve çevrimdışı'));
    expect(mockPush).toHaveBeenCalledWith('/privacy');
    fireEvent.press(u.getByLabelText('Gizlilik politikası'));
    expect(open).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  });
});
