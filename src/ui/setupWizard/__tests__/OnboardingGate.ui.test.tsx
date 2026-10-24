// İlk açılış kapıları: sihirbaz önce, giriş ekranı sonra — ve sihirbazın hesap
// adımını gören kullanıcıya giriş ekranı İKİNCİ kez gösterilmez.

import { Platform } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { userRepo } from '@/db';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { OnboardingGate, LOGIN_SEEN_KEY, ONBOARDING_SEEN_KEY } from '@/ui/Onboarding';
import { LoginGate } from '@/ui/LoginScreen';

let mockUserId = 'placeholder';

jest.mock('@/config', () => ({ ACCOUNTS_ENABLED: true }));
jest.mock('@/sync', () => ({ isGoogleSignInConfigured: true, isSyncConfigured: true }));
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, authUser: null, notifyDataChanged: jest.fn() }),
  useOptionalAppData: () => null,
}));
jest.mock('@/lib/notifications', () => ({
  notificationPermission: async () => ({ granted: false, canAskAgain: true }),
  ensurePermission: async () => false,
  rescheduleEverything: async () => {},
}));
jest.mock('@/ui/useGoogleSignIn', () => ({
  useGoogleSignIn: () => ({ available: true, busy: false, error: null, signIn: jest.fn() }),
}));

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  mockUserId = userRepo.getOrCreateLocal().id;
  jest.replaceProperty(Platform, 'OS', 'android');
});

afterEach(() => jest.restoreAllMocks());

const Gates = () => (
  <>
    <OnboardingGate />
    <LoginGate />
  </>
);

// The login screen's own title (tr), read from the dictionary so the test
// doesn't break when the wording changes.
const loginTitle = () => require('@/i18n/translations').translations.tr['login.title'] as string;

describe('OnboardingGate + LoginGate', () => {
  it('ilk açılışta yalnız sihirbaz görünür, giriş ekranı beklemede', async () => {
    const u = await renderUI(<Gates />);
    expect(await u.findByText('Erek’e hoş geldin')).toBeTruthy();
    expect(u.queryByText(loginTitle())).toBeNull();
  });

  it('ilk açılış YENİ KURULUM sayılır (özellik rehberleri kendiliğinden açılabilsin)', async () => {
    await renderUI(<Gates />);
    await waitFor(async () => expect(await AsyncStorage.getItem('guide:newInstall')).toBe('1'));
  });

  it('sihirbazı daha önce görmüş kullanıcı yeni kurulum sayılmaz', async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    await renderUI(<Gates />);
    await new Promise((r) => setTimeout(r, 20));
    expect(await AsyncStorage.getItem('guide:newInstall')).toBeNull();
  });

  it('daha önce görüldüyse hiçbiri açılmaz', async () => {
    await AsyncStorage.multiSet([[ONBOARDING_SEEN_KEY, '1'], [LOGIN_SEEN_KEY, '1']]);
    const u = await renderUI(<Gates />);
    await new Promise((r) => setTimeout(r, 20));
    expect(u.queryByText('Erek’e hoş geldin')).toBeNull();
    expect(u.queryByText(loginTitle())).toBeNull();
  });

  it('ilk açılışta "Hepsini atla" yoktur; alışkanlık/görev/hedef atlanamaz', async () => {
    const u = await renderUI(<Gates />);
    expect(u.queryByLabelText('Kurulum sihirbazının tamamını atla')).toBeNull();
    fireEvent.press(await u.findByText('İlk kez kullanıyorum'));
    fireEvent.press(u.getByLabelText('Devam')); // görünüm (atlanabilir)
    for (const step of ['habit', 'task', 'goal']) {
      expect(u.queryByText('Bu adımı atla')).toBeNull();
      expect(u.getByLabelText('Devam').props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(u.getByLabelText('Devam')); // basılsa da geçmez
      expect(u.queryByText('Hazırsın!')).toBeNull();
      if (step === 'habit') {
        fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
        fireEvent.press(u.getByText('Alışkanlığı ekle'));
      } else if (step === 'task') {
        fireEvent.changeText(u.getByPlaceholderText(/./), 'Annemi ara');
        fireEvent.press(u.getByText('Görevi ekle'));
      } else {
        const inputs = u.UNSAFE_getAllByType(require('react-native').TextInput);
        fireEvent.changeText(inputs[0], 'Koş');
        fireEvent.changeText(inputs[1], '100');
        fireEvent.press(u.getByText('Hedefi ekle'));
      }
      fireEvent.press(u.getByLabelText('Devam'));
    }
  });

  it('hesap adımını görüp atlayan kullanıcıya giriş ekranı İKİNCİ kez çıkmaz', async () => {
    const u = await renderUI(<Gates />);
    fireEvent.press(await u.findByText('İlk kez kullanıyorum'));
    fireEvent.press(u.getByLabelText('Devam')); // görünüm
    fireEvent.changeText(u.getByPlaceholderText('Alışkanlığın adı'), 'Su iç');
    fireEvent.press(u.getByLabelText('Devam')); // "Devam" dolu formu kaydeder
    fireEvent.changeText(u.getByPlaceholderText(/./), 'Annemi ara');
    fireEvent.press(u.getByLabelText('Devam'));
    const inputs = u.UNSAFE_getAllByType(require('react-native').TextInput);
    fireEvent.changeText(inputs[0], 'Koş');
    fireEvent.changeText(inputs[1], '100');
    fireEvent.press(u.getByLabelText('Devam'));
    for (let i = 0; i < 5; i++) fireEvent.press(u.queryByText('Bu adımı atla') ?? u.getByLabelText('Devam')); // bildirim, widget, hesap, ipuçları, rehberler
    fireEvent.press(u.getByLabelText('Erek’i aç'));

    await waitFor(async () => expect(await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)).toBe('1'));
    expect(await AsyncStorage.getItem(LOGIN_SEEN_KEY)).toBe('1');
    await new Promise((r) => setTimeout(r, 30));
    expect(u.queryByText(loginTitle())).toBeNull();
    expect(u.queryByText('Hazırsın!')).toBeNull(); // sihirbaz da kapandı
  });

  it('sihirbazı görmüş ama giriş ekranını görmemiş (eski) kullanıcıya giriş ekranı yine bir kez gelir', async () => {
    // Existing behaviour kept: the sign-in offer still comes once.
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    const u = await renderUI(<Gates />);
    expect(await u.findByText(loginTitle())).toBeTruthy();
    expect(u.queryByText('Erek’e hoş geldin')).toBeNull();
  });
});
