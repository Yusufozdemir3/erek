// Görevler sekmesinde arama: uzun listede görünür, başlığa göre süzer,
// tamamlananları da bulur, boş sonuçta açıklama verir.

import { fireEvent } from '@testing-library/react-native';
import TasksScreen from '../../../app/(tabs)/tasks';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { taskRepo, userRepo } from '@/db';

let mockUserId = '';

jest.mock('expo-router', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]) };
});
jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ user: { id: mockUserId }, dataVersion: 0, notifyDataChanged: jest.fn() }),
}));
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: jest.fn(),
  cancelTaskReminders: jest.fn(async () => {}),
  scheduleTaskReminders: jest.fn(),
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

const PLACEHOLDER = 'Görevlerde ara';

beforeEach(async () => {
  await resetTestDb();
  mockUserId = userRepo.getOrCreateLocal().id;
});

function seed(n: number) {
  for (let i = 0; i < n; i++) taskRepo.create({ user_id: mockUserId, title: `Görev ${i}` });
}

describe('Görevler: arama', () => {
  it('kısa listede arama kutusu yok', async () => {
    seed(3);
    const u = await renderUI(<TasksScreen />);
    expect(u.queryByLabelText(PLACEHOLDER)).toBeNull();
  });

  it('uzun listede görünür ve başlığa göre süzer (aksansız, harf farkı yok)', async () => {
    seed(9);
    taskRepo.create({ user_id: mockUserId, title: 'Alışveriş yap' });
    const u = await renderUI(<TasksScreen />);
    fireEvent.changeText(u.getByLabelText(PLACEHOLDER), 'ALIS');
    expect(await u.findByText('Alışveriş yap')).toBeTruthy();
    expect(u.queryByText('Görev 1')).toBeNull();
  });

  it('tamamlanan görev de bulunur; "Tamamlananlar" başlığı aramada yok', async () => {
    seed(8);
    const done = taskRepo.create({ user_id: mockUserId, title: 'Bitmiş iş' });
    taskRepo.setCompleted(done.id, true);
    const u = await renderUI(<TasksScreen />);
    expect(u.queryByText('Bitmiş iş')).toBeNull(); // normalde katlanmış bölümde
    fireEvent.changeText(u.getByLabelText(PLACEHOLDER), 'bitmis');
    expect(await u.findByText('Bitmiş iş')).toBeTruthy();
    expect(u.queryByLabelText(/Tamamlanan/)).toBeNull();
  });

  it('eşleşme yoksa açıklama; temizleyince liste döner', async () => {
    seed(9);
    const u = await renderUI(<TasksScreen />);
    fireEvent.changeText(u.getByLabelText(PLACEHOLDER), 'zzzz');
    expect(await u.findByText('Eşleşen görev yok')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Aramayı temizle'));
    expect(await u.findByText('Görev 1')).toBeTruthy();
    expect(u.queryByText('Eşleşen görev yok')).toBeNull();
  });
});
