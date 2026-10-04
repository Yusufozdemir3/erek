// Profil menüsündeki Arkadaşlar satırı: girişliyken gerçek satır, girişsizken kilitli satır
// (Google girişine götürür), hesaplar kapalı sürümde hiç yok.

import { fireEvent } from '@testing-library/react-native';
import ProfileScreen from '../../../app/profile';
import { renderUI } from '@/test/renderWithProviders';

let mockAuth: { id: string; isAnonymous: boolean } | null = null;
let mockAccounts = true;
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/config', () => ({
  get ACCOUNTS_ENABLED() {
    return mockAccounts;
  },
}));
jest.mock('@/ui/AppData', () => ({ useAppData: () => ({ authUser: mockAuth }) }));

beforeEach(() => {
  mockAuth = null;
  mockAccounts = true;
  mockPush.mockClear();
});

describe('Profil › Arkadaşlar satırı', () => {
  it('girişliyken Arkadaşlar ekranına gider, kilit ipucu yok', async () => {
    mockAuth = { id: 'a', isAnonymous: false };
    const u = await renderUI(<ProfileScreen />);
    fireEvent.press(await u.findByLabelText('Arkadaşlar'));
    expect(mockPush).toHaveBeenCalledWith('/friends');
    expect(u.queryByText('Google ile giriş yapınca açılır')).toBeNull();
  });

  it('girişsizken kilitli satır görünür ve hesap sayfasına götürür', async () => {
    const u = await renderUI(<ProfileScreen />);
    expect(await u.findByText('Google ile giriş yapınca açılır')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Arkadaşlar. Google ile giriş yapınca açılır'));
    expect(mockPush).toHaveBeenCalledWith('/account-sync');
  });

  it('anonim oturum da girişsiz sayılır', async () => {
    mockAuth = { id: 'x', isAnonymous: true };
    const u = await renderUI(<ProfileScreen />);
    expect(await u.findByText('Google ile giriş yapınca açılır')).toBeTruthy();
  });

  it('hesaplar kapalı sürümde satır hiç yok', async () => {
    mockAccounts = false;
    const u = await renderUI(<ProfileScreen />);
    await u.findByLabelText('Görünüm');
    expect(u.queryByText('Arkadaşlar')).toBeNull();
    expect(u.queryByText('Google ile giriş yapınca açılır')).toBeNull();
  });
});
