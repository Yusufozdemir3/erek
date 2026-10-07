// Today: a task carried over from an earlier day shows its date as overdue.

import AsyncStorage from '@react-native-async-storage/async-storage';
import TodayScreen from '../../../app/(tabs)/index';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { taskRepo, userRepo } from '@/db';
import { shiftYmd, todayDate } from '@/lib/helpers';
import { shortDate } from '@/ui/theme';

let mockUserId = '';
let mockSelectedDate = '';

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({
    user: { id: mockUserId },
    selectedDate: mockSelectedDate,
    setSelectedDate: jest.fn(),
    dataVersion: 0,
    notifyDataChanged: jest.fn(),
  }),
}));
jest.mock('@/ui/TimerProvider', () => ({
  useTimer: () => ({ isRunning: () => false }),
}));
jest.mock('@/widget/widgetData', () => ({ refreshWidget: jest.fn() }));
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(),
  cancelTaskReminders: jest.fn(),
  scheduleTaskReminders: jest.fn(),
}));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/Confetti', () => ({ Confetti: () => null }));
jest.mock('@/ui/sharedTaskUi', () => ({
  ...jest.requireActual('@/ui/sharedTaskUi'),
  toggleSharedTaskOptimistic: jest.fn(),
  useFriendNames: () => new Map(),
  useSharedTasksFreshness: jest.fn(),
  useFriends: () => [],
}));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const View = RN.View;
  const A: any = { View, createAnimatedComponent: (c: unknown) => c };
  return { __esModule: true, default: A, LinearTransition: { duration: () => ({}) } };
});

jest.setTimeout(20000);

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  mockUserId = userRepo.getOrCreateLocal().id;
  mockSelectedDate = todayDate();
});

describe('Bugün: geciken görev', () => {
  it('önceki günden kalan açık görevde tarih işareti var, bugünküde yok', async () => {
    taskRepo.create({ user_id: mockUserId, title: 'Eski iş', due_date: shiftYmd(todayDate(), -3) });
    taskRepo.create({ user_id: mockUserId, title: 'Bugünkü iş', due_date: todayDate() });
    const u = await renderUI(<TodayScreen />);
    expect(await u.findByText('Eski iş')).toBeTruthy();
    expect(u.getByText(shortDate(shiftYmd(todayDate(), -3), 'tr'))).toBeTruthy();
    expect(u.getByText('Bugünkü iş')).toBeTruthy();
    expect(u.queryByText(shortDate(todayDate(), 'tr'))).toBeNull();
  });
});
