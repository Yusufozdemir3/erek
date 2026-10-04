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

  it('"Hepsini atla": bayrak yazılır, hesap adımı görülmediği için giriş ekranı arkadan gelir', async () => {
    const u = await renderUI(<Gates />);
    fireEvent.press(await u.findByLabelText('Kurulum sihirbazının tamamını atla'));
    expect(await u.findByText(loginTitle())).toBeTruthy();
    expect(await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)).toBe('1');
    expect(await AsyncStorage.getItem(LOGIN_SEEN_KEY)).toBeNull();
  });

  it('hesap adımını görüp atlayan kullanıcıya giriş ekranı İKİNCİ kez çıkmaz', async () => {
    const u = await renderUI(<Gates />);
    fireEvent.press(await u.findByLabelText('Kuruluma başla'));
    for (let i = 0; i < 7; i++) fireEvent.press(u.getByLabelText('Devam')); // hesap adımı dahil
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
