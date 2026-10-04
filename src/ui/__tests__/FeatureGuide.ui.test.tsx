// Özellik rehberi: sayfalar arasında gezinir, atlanır, düğmesi doğru yere götürür; Hedefler
// ekranında yeni kurulumda kendiliğinden açılır, eski kullanıcıda yalnızca "?" ile açılır.

import { fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GoalsScreen from '../../../app/(tabs)/goals';
import HabitsScreen from '../../../app/(tabs)/habits';
import TasksScreen from '../../../app/(tabs)/tasks';
import { FeatureGuide } from '../guide/FeatureGuide';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { userRepo } from '@/db';

let mockUserId = '';
let mockAuth: { id?: string; isAnonymous: boolean } | null = null;
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: (...a: unknown[]) => mockPush(...a) },
  };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, authUser: mockAuth, dataVersion: 0, notifyDataChanged: jest.fn() }),
  useOptionalAppData: () => null,
}));
jest.mock('@/lib/notifications', () => ({
  cancelGoalReminders: jest.fn(async () => {}),
  cancelHabitReminders: jest.fn(async () => {}),
  cancelTaskReminders: jest.fn(async () => {}),
  refreshTaskReminders: jest.fn(),
  rescheduleEverything: jest.fn(async () => {}),
}));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/SharedLists', () => ({
  SharedGoalsSection: () => null,
  SharedHabitsSection: () => null,
  useSharedLists: () => ({ sharedGoals: [], sharedHabits: [], hideGoal: jest.fn(), hideHabit: jest.fn() }),
}));

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('login:seen', '1'); // giriş ekranı çoktan geçilmiş
  mockUserId = userRepo.getOrCreateLocal().id;
  mockAuth = null;
  mockPush.mockClear();
});

describe('FeatureGuide', () => {
  it('sayfalar arasında gezinir; son sayfada "Tamam" kapatır', async () => {
    const onClose = jest.fn();
    const u = await renderUI(<FeatureGuide guide="goals" visible onClose={onClose} canShare={false} />);
    expect(await u.findByText('Hedef nedir?')).toBeTruthy();
    fireEvent.press(u.getByText('İleri'));
    expect(await u.findByText('İki tür hedef')).toBeTruthy();
    fireEvent.press(u.getByText('‹ Geri'));
    expect(await u.findByText('Hedef nedir?')).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.press(u.getByText('İleri'));
    expect(await u.findByText('Tempo ve tahmin')).toBeTruthy(); // hesapsız: 5 sayfa, paylaşım sayfası yok
    expect(u.queryByText('Atla')).toBeNull(); // son sayfada atla yok
    fireEvent.press(u.getByText('Tamam'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hesaplıyken paylaşım sayfası da var', async () => {
    const u = await renderUI(<FeatureGuide guide="goals" visible onClose={jest.fn()} canShare />);
    for (let i = 0; i < 5; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Arkadaşlarla ortak hedef')).toBeTruthy();
  });

  it('"Atla" kapatır', async () => {
    const onClose = jest.fn();
    const u = await renderUI(<FeatureGuide guide="goals" visible onClose={onClose} />);
    fireEvent.press(await u.findByText('Atla'));
    expect(onClose).toHaveBeenCalled();
  });

  it('alışkanlık sayfasındaki düğme kapatır ve Alışkanlıklar sekmesine götürür', async () => {
    const onClose = jest.fn();
    const u = await renderUI(<FeatureGuide guide="goals" visible onClose={onClose} />);
    for (let i = 0; i < 3; i++) fireEvent.press(await u.findByText('İleri'));
    fireEvent.press(await u.findByText('Alışkanlıklara git'));
    expect(onClose).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/habits');
  });

  it('görünmezken hiçbir şey çizmez', async () => {
    const u = await renderUI(<FeatureGuide guide="goals" visible={false} onClose={jest.fn()} />);
    expect(u.queryByText('Hedef nedir?')).toBeNull();
  });
});

describe('Hedefler ekranında rehber', () => {
  it('yeni kurulumda ilk girişte kendiliğinden açılır ve bir daha açılmaz', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<GoalsScreen />);
    expect(await u.findByText('Hedef nedir?')).toBeTruthy();
    await waitFor(async () => expect(await AsyncStorage.getItem('guide:seen:goals')).toBe('1'));
    fireEvent.press(u.getByText('Atla'));
    await waitFor(() => expect(u.queryByText('Hedef nedir?')).toBeNull());
    u.unmount();

    const again = await renderUI(<GoalsScreen />);
    await again.findByText('Hedefler');
    expect(again.queryByText('Hedef nedir?')).toBeNull();
  });

  it('eski kullanıcıda kendiliğinden açılmaz, "?" düğmesi açar', async () => {
    await AsyncStorage.setItem('onboarding:done', '1'); // yeni kurulum işareti yok
    const u = await renderUI(<GoalsScreen />);
    await u.findByLabelText('Bu ekranın rehberini aç');
    expect(u.queryByText('Hedef nedir?')).toBeNull();
    fireEvent.press(u.getByLabelText('Bu ekranın rehberini aç'));
    expect(await u.findByText('Hedef nedir?')).toBeTruthy();
  });
});

describe('Alışkanlıklar ekranında rehber', () => {
  it('yeni kurulumda ilk girişte açılır; Hedeflere git düğmesi rotayı açar', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<HabitsScreen />);
    expect(await u.findByText('Alışkanlık nedir?')).toBeTruthy();
    for (let i = 0; i < 6; i++) fireEvent.press(await u.findByText('İleri'));
    fireEvent.press(await u.findByText('Hedeflere git'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/goals');
    await waitFor(() => expect(u.queryByText('Alışkanlık nedir?')).toBeNull());
  });

  it('eski kullanıcıda yalnızca ? ile açılır, Hedefler rehberinden bağımsız görülür', async () => {
    await AsyncStorage.setItem('onboarding:done', '1');
    await AsyncStorage.setItem('guide:seen:goals', '1');
    const u = await renderUI(<HabitsScreen />);
    await u.findByLabelText('Bu ekranın rehberini aç');
    expect(u.queryByText('Alışkanlık nedir?')).toBeNull();
    fireEvent.press(u.getByLabelText('Bu ekranın rehberini aç'));
    expect(await u.findByText('Alışkanlık nedir?')).toBeTruthy();
  });

  it('Hedefler rehberini görmüş yeni kullanıcı Alışkanlıklar rehberini yine görür', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    await AsyncStorage.setItem('guide:seen:goals', '1');
    const u = await renderUI(<HabitsScreen />);
    expect(await u.findByText('Alışkanlık nedir?')).toBeTruthy();
  });
});

describe('Görevler ekranında rehber', () => {
  it('yeni kurulumda ilk girişte açılır; hesapsızken paylaşım sayfası yok (6 sayfa)', async () => {
    await AsyncStorage.setItem('guide:newInstall', '1');
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<TasksScreen />);
    expect(await u.findByText('Görev nedir?')).toBeTruthy();
    for (let i = 0; i < 5; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Hatırlatma ve sesle ekleme')).toBeTruthy();
    expect(u.getByText('Tamam')).toBeTruthy();
  });

  it('girişliyken yedinci sayfa paylaşımı anlatır; ? ile yeniden açılır', async () => {
    mockAuth = { id: 'a', isAnonymous: false };
    await AsyncStorage.setItem('onboarding:done', '1');
    const u = await renderUI(<TasksScreen />);
    fireEvent.press(await u.findByLabelText('Bu ekranın rehberini aç'));
    for (let i = 0; i < 6; i++) fireEvent.press(await u.findByText('İleri'));
    expect(await u.findByText('Arkadaşınla paylaş')).toBeTruthy();
  });
});

describe('Bugün rehberi: sihirbaz ve giriş ekranı kapanana kadar bekler', () => {
  it('ekran zaten açıkken kapılar kapanınca açılır (Bugün sekmesi sihirbazın arkasında kurulur)', async () => {
    const { announceGatesClosed } = require('@/lib/guides');
    await AsyncStorage.setItem('guide:newInstall', '1'); // sihirbaz hâlâ açık: onboarding:done yok
    await AsyncStorage.removeItem('login:seen');
    const u = await renderUI(<GoalsScreen />);
    await u.findByLabelText('Bu ekranın rehberini aç');
    expect(u.queryByText('Hedef nedir?')).toBeNull();

    await AsyncStorage.setItem('onboarding:done', '1');
    await AsyncStorage.setItem('login:seen', '1');
    announceGatesClosed();
    expect(await u.findByText('Hedef nedir?')).toBeTruthy();
  });
});
