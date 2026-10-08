// Silmeyi geri al: Görevler sekmesinde iki dokunuşla silince alt çubuk çıkar, "Geri al" kaydı geri getirir.

import { fireEvent, waitFor } from '@testing-library/react-native';
import TasksScreen from '../../../app/(tabs)/tasks';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { taskRepo, userRepo } from '@/db';

let mockUserId = '';
const mockReschedule = jest.fn(async () => {});

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('@/ui/AppData', () => {
  const app = () => ({ user: { id: mockUserId }, dataVersion: 0, notifyDataChanged: jest.fn() });
  return { useAppData: app, useOptionalAppData: app };
});
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(),
  cancelTaskReminders: jest.fn(async () => {}),
  scheduleTaskReminders: jest.fn(),
  rescheduleEverything: (...a: unknown[]) => (mockReschedule as any)(...a),
}));
jest.mock('@/ui/ProfileButton', () => ({ ProfileButton: () => null }));
jest.mock('@/ui/sharedTaskUi', () => ({
  ...jest.requireActual('@/ui/sharedTaskUi'),
  toggleSharedTaskOptimistic: jest.fn(),
  useFriendNames: () => new Map(),
  useSharedTasksFreshness: jest.fn(),
  useFriends: () => [],
}));
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  return { __esModule: true, default: { View: RN.View, createAnimatedComponent: (c: unknown) => c }, LinearTransition: { duration: () => ({}) } };
});

beforeEach(async () => {
  await resetTestDb();
  jest.clearAllMocks();
  mockUserId = userRepo.getOrCreateLocal().id;
});

describe('Görevler: silmeyi geri al', () => {
  it('iki dokunuşla silinir, çubuk görünür; Geri al görevi geri getirir', async () => {
    const t = taskRepo.create({ user_id: mockUserId, title: 'Market', due_date: '2026-10-05' });
    const u = await renderUI(<TasksScreen />);

    fireEvent.press(await u.findByLabelText('Market, sil'));
    fireEvent.press(u.getByLabelText('Silmek için tekrar bas'));

    expect(taskRepo.getById(t.id)).toBeNull();
    expect(await u.findByText('“Market” silindi')).toBeTruthy();

    fireEvent.press(u.getByLabelText('Geri al'));
    expect(taskRepo.getById(t.id)?.title).toBe('Market');
    expect(mockReschedule).toHaveBeenCalledWith(mockUserId);
    await waitFor(() => expect(u.queryByText('“Market” silindi')).toBeNull());
  });

  it('süre dolunca çubuk kaybolur, silme kalıcı kalır', async () => {
    jest.useFakeTimers();
    try {
      const t = taskRepo.create({ user_id: mockUserId, title: 'Market', due_date: '2026-10-05' });
      const u = await renderUI(<TasksScreen />);
      fireEvent.press(u.getByLabelText('Market, sil'));
      fireEvent.press(u.getByLabelText('Silmek için tekrar bas'));
      expect(u.getByText('“Market” silindi')).toBeTruthy();
      const { act } = require('@testing-library/react-native');
      await act(async () => {
        jest.advanceTimersByTime(7000);
      });
      expect(u.queryByText('“Market” silindi')).toBeNull();
      expect(taskRepo.getById(t.id)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
