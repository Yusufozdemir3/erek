// Rehberler listesi (Profil › Rehberler) ve Bildirimler ekranındaki rehber:
// her rehber listeden açılır, "Yeni" etiketi görülünce kalkar; Widget rehberi yalnız buradan bulunur.

import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GuidesScreen from '../../../app/guides';
import NotificationsScreen from '../../../app/notifications';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { userRepo } from '@/db';

let mockAuth: { id: string; isAnonymous: boolean } | null = null;
let mockUserId = '';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, authUser: mockAuth, dataVersion: 0, notifyDataChanged: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({
  rescheduleAllGoalReminders: jest.fn(async () => {}),
  rescheduleAllReminders: jest.fn(async () => {}),
  rescheduleAllTaskReminders: jest.fn(async () => {}),
  scheduleWeeklyReview: jest.fn(async () => {}),
  ensurePermission: jest.fn(async () => true),
}));
jest.mock('@/lib/customNotificationChannel', () => ({ getCustomSoundTitle: jest.fn(async () => null) }));
jest.mock('@/lib/ringtonePicker', () => ({ pickNotificationSound: jest.fn() }));
jest.mock('@/lib/pushRegistration', () => ({ syncPushRegistration: jest.fn() }));
jest.mock('@/sync', () => ({ getNudgePrefs: jest.fn(async () => ({ enabled: true, muted: [] })), setNudgesEnabled: jest.fn() }));

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('login:seen', '1');
  mockUserId = userRepo.getOrCreateLocal().id;
  mockAuth = null;
});

describe('Rehberler listesi', () => {
  it('yedi rehberi listeler; hepsi yeni; açınca etiket kalkar ve "görüldü" yazılır', async () => {
    const u = await renderUI(<GuidesScreen />);
    for (const name of ['Bugün ekranı', 'Alışkanlıklar', 'Görevler', 'Hedefler', 'Arkadaşlar', 'Widget’lar', 'Bildirimler']) {
      expect(await u.findByText(name)).toBeTruthy();
    }
    expect(u.getAllByText('Yeni')).toHaveLength(7);

    fireEvent.press(u.getByLabelText('Widget’lar rehberini aç'));
    expect(await u.findByText('Ana ekranına Erek')).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Uygulama kapalıyken')).toBeTruthy();
    fireEvent.press(u.getByText('Tamam'));

    await waitFor(() => expect(u.getAllByText('Yeni')).toHaveLength(6));
    expect(await AsyncStorage.getItem('guide:seen:widgets')).toBe('1');
  });

  it('daha önce görülenlerde "Yeni" yok', async () => {
    for (const id of ['today', 'habits', 'tasks', 'goals', 'friends', 'widgets', 'notifications']) {
      await AsyncStorage.setItem(`guide:seen:${id}`, '1');
    }
    const u = await renderUI(<GuidesScreen />);
    await u.findByText('Widget’lar');
    await new Promise((r) => setTimeout(r, 30));
    expect(u.queryByText('Yeni')).toBeNull();
  });
});

describe('Bildirimler ekranında rehber', () => {
  it('yeni kurulumda ilk girişte açılır; hesapsızken 3 sayfa', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<NotificationsScreen />);
    expect(await u.findByText('Hatırlatmalar')).toBeTruthy();
    for (let i = 0; i < 2; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Zamanlayıcı ve haftalık özet')).toBeTruthy();
    expect(u.getByText('Tamam')).toBeTruthy();
  });

  it('bağlantı rehberi yeniden açar; girişliyken arkadaş sayfası da var', async () => {
    mockAuth = { id: 'a', isAnonymous: false };
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<NotificationsScreen />);
    fireEvent.press(await u.findByText('Bildirimler nasıl çalışır?'));
    for (let i = 0; i < 3; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText(/tek bir arkadaşı da Arkadaşlar ekranındaki zil simgesiyle/)).toBeTruthy();
  });
});
