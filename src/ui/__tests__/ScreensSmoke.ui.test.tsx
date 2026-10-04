// Duman testi: taze kurulumda (boş veritabanı) ana ekranlar çökmeden açılır.
// Her ekranın kendi testi ayrıntıyı denetler; burada tek amaç "açılıyor mu".

import { waitFor } from '@testing-library/react-native';
import { renderUI } from '@/test/renderWithProviders';
import { TimerProvider } from '@/ui/TimerProvider';
import { resetTestDb } from '@/test/dbTestUtils';
import { goalEntryRepo, goalMilestoneRepo, goalRepo, habitRepo, reminderRepo, subtaskRepo, taskRepo, userRepo } from '@/db';
import { shiftYmd, todayDate } from '@/lib/helpers';

import HabitDetail from '../../../app/habit/[id]';
import GoalDetail from '../../../app/goal/[id]';
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
    router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => ({ id: (globalThis as { __smokeId?: string }).__smokeId, tab: (globalThis as { __smokeTab?: string }).__smokeTab }),
    Redirect: () => null,
  };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({
    user: { id: mockUserId },
    authUser: null,
    selectedDate: require('@/lib/helpers').todayDate(),
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
    const u = await renderUI(<TimerProvider>{make()}</TimerProvider>);
    await waitFor(() => expect(u.toJSON()).not.toBeNull());
  });
});

// A phone that's been used: every kind of habit/task/goal, history, reminders.
function seedEverything(): { habitId: string; goalId: string } {
  const uid = mockUserId;
  const goal = goalRepo.create({ user_id: uid, title: 'Koş', goal_type: 'numeric', target_value: 100, unit: 'km', deadline: shiftYmd(todayDate(), 40) });
  goalMilestoneRepo.create(goal.id, '50 km', { amount: 50 });
  goalEntryRepo.create(goal.id, 12);
  goalRepo.addProgress(goal.id, 12);
  goalRepo.create({ user_id: uid, title: 'Kitaplar', goal_type: 'milestone' });
  const bin = habitRepo.create({ user_id: uid, title: 'Kitap oku', icon: 'book', goal_id: goal.id, start_date: shiftYmd(todayDate(), -30) });
  const num = habitRepo.create({ user_id: uid, title: 'Su iç', kind: 'numeric', target_amount: 8, unit: 'bardak', start_date: shiftYmd(todayDate(), -30) });
  const timer = habitRepo.create({ user_id: uid, title: 'Meditasyon', kind: 'timer', target_amount: 600 });
  habitRepo.create({ user_id: uid, title: 'Spor', schedule: { freq: 'weekly', weekdays: [], timesPerWeek: 3 } as never });
  for (let d = 0; d < 20; d++) {
    habitRepo.toggleLog(bin.id, shiftYmd(todayDate(), -d), d % 4 !== 3);
    habitRepo.incrementAmount(num.id, shiftYmd(todayDate(), -d), (d % 9), 8);
  }
  habitRepo.incrementAmount(timer.id, todayDate(), 120, 600);
  reminderRepo.replaceAll('habit', bin.id, ['08:00', '21:00']);
  const t = taskRepo.create({ user_id: uid, title: 'Alışveriş', due_date: todayDate(), priority: 'high' });
  subtaskRepo.create(t.id, 'Süt');
  taskRepo.create({ user_id: uid, title: 'Eski iş', due_date: shiftYmd(todayDate(), -4) });
  const done = taskRepo.create({ user_id: uid, title: 'Bitti', due_date: todayDate() });
  taskRepo.setCompleted(done.id, true);
  taskRepo.create({ user_id: uid, title: 'Tekrarlı', due_date: todayDate(), recurrence: { freq: 'daily' } as never });
  return { habitId: num.id, goalId: goal.id };
}

describe('kullanılmış telefonda ekranlar açılır', () => {
  it.each(SCREENS)('%s', async (_name, make) => {
    seedEverything();
    const u = await renderUI(<TimerProvider>{make()}</TimerProvider>);
    await waitFor(() => expect(u.toJSON()).not.toBeNull());
  });
});

describe('ayrıntı ekranları dolu veritabanıyla açılır', () => {
  afterEach(() => {
    delete (globalThis as { __smokeId?: string }).__smokeId;
    delete (globalThis as { __smokeTab?: string }).__smokeTab;
  });

  it('alışkanlık istatistikleri (sayısal, geçmişli)', async () => {
    const { habitId } = seedEverything();
    (globalThis as { __smokeId?: string }).__smokeId = habitId;
    const u = await renderUI(<TimerProvider><HabitDetail /></TimerProvider>);
    await waitFor(() => expect(u.toJSON()).not.toBeNull());
  });

  it.each(['stats', 'edit', undefined])('hedef ekranı, sekme: %s', async (tab) => {
    const { goalId } = seedEverything();
    (globalThis as { __smokeId?: string }).__smokeId = goalId;
    (globalThis as { __smokeTab?: string }).__smokeTab = tab;
    const u = await renderUI(<TimerProvider><GoalDetail /></TimerProvider>);
    await waitFor(() => expect(u.toJSON()).not.toBeNull());
  });
});
