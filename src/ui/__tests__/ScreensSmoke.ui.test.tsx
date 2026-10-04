// Duman testi: taze kurulumda (boş veritabanı) ana ekranlar çökmeden açılır.
// Her ekranın kendi testi ayrıntıyı denetler; burada tek amaç "açılıyor mu".

import { waitFor } from '@testing-library/react-native';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { userRepo } from '@/db';

import TodayScreen from '../../../app/(tabs)/index';
import TasksScreen from '../../../app/(tabs)/tasks';
import HabitsScreen from '../../../app/(tabs)/habits';
import GoalsScreen from '../../../app/(tabs)/goals';
import ProfileScreen from '../../../app/profile';
import ReviewScreen from '../../../app/review';
import DataScreen from '../../../app/data';
import AboutScreen from '../../../app/about';
import PrivacyScreen from '../../../app/privacy';
import AppearanceScreen from '../../../app/appearance';
import NotificationsScreen from '../../../app/notifications';

jest.setTimeout(60000);

let mockUserId = '';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: jest.fn(), navigate: jest.fn() },
    Redirect: () => null,
  };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({
    user: { id: mockUserId },
    authUser: null,
    selectedDate: new Date().toISOString().slice(0, 10).replace(/-(\d\d)-(\d\d)$/, '-$1-$2'),
    setSelectedDate: jest.fn(),
    dataVersion: 0,
    notifyDataChanged: jest.fn(),
    syncResult: null,
    lastSyncAt: null,
    syncing: false,
    syncNow: jest.fn(),
  }),
  useOptionalAppData: () => null,
}));
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(),
  cancelTaskReminders: jest.fn(async () => {}),
  cancelHabitReminders: jest.fn(async () => {}),
  cancelGoalReminders: jest.fn(async () => {}),
  scheduleTaskReminders: jest.fn(),
  rescheduleEverything: jest.fn(async () => {}),
  notificationPermission: jest.fn(async () => ({ granted: false, canAskAgain: true })),
  ensurePermission: jest.fn(async () => false),
}));
jest.mock('@/widget/widgetData', () => ({ refreshWidget: jest.fn(), drainWidgetQueue: jest.fn(async () => 0) }));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/Confetti', () => ({ Confetti: () => null }));
jest.mock('@/ui/SharedLists', () => ({
  useSharedLists: () => ({ reload: jest.fn() }),
  SharedHabitsSection: () => null,
  SharedGoalsSection: () => null,
}));
jest.mock('@/ui/sharedTaskUi', () => ({
  ...jest.requireActual('@/ui/sharedTaskUi'),
  useFriendNames: () => new Map(),
  useSharedTasksFreshness: jest.fn(),
  useFriends: () => [],
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => ({ canceled: true, assets: null }) }));
jest.mock('expo-file-system', () => ({ cacheDirectory: 'file:///c/', readAsStringAsync: jest.fn(), writeAsStringAsync: jest.fn(), deleteAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: jest.fn() }));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return { __esModule: true, default: { View: RN.View, createAnimatedComponent: (c: unknown) => c }, LinearTransition: { duration: () => ({}) } };
});

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
});

const SCREENS: [string, () => JSX.Element][] = [
  ['Bugün', () => <TodayScreen />],
  ['Görevler', () => <TasksScreen />],
  ['Alışkanlıklar', () => <HabitsScreen />],
  ['Hedefler', () => <GoalsScreen />],
  ['Profil', () => <ProfileScreen />],
  ['Haftalık özet', () => <ReviewScreen />],
  ['Verilerim', () => <DataScreen />],
  ['Hakkında', () => <AboutScreen />],
  ['Gizlilik', () => <PrivacyScreen />],
  ['Görünüm', () => <AppearanceScreen />],
  ['Bildirimler', () => <NotificationsScreen />],
];

describe('taze kurulumda ekranlar açılır', () => {
  it.each(SCREENS)('%s', async (_name, make) => {
    const u = await renderUI(make());
    await waitFor(() => expect(u.toJSON()).not.toBeNull());
  });
});
