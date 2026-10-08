// Görevler sekmesinde toplu seçim: uzun basınca başlar, satırlara dokunmak seçer,
// alttaki çubuk tamamla / yarına al / sil yapar; hepsi tek "Geri al" ile döner.

import { Alert } from 'react-native';
import { fireEvent, waitFor, act } from '@testing-library/react-native';
import TasksScreen from '../../../app/(tabs)/tasks';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { taskRepo, userRepo } from '@/db';
import { shiftYmd, todayDate } from '@/lib/helpers';

let mockUserId = '';

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
  rescheduleEverything: jest.fn(async () => {}),
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

const edit = (title: string) => `${title}, düzenle`;
const pick = (title: string) => `${title} görevini seç`;

let a: string;
let b: string;
let c: string;

beforeEach(async () => {
  await resetTestDb();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUserId = userRepo.getOrCreateLocal().id;
  a = taskRepo.create({ user_id: mockUserId, title: 'Birinci', due_date: todayDate() }).id;
  b = taskRepo.create({ user_id: mockUserId, title: 'İkinci', due_date: `${todayDate()}T09:30:00` }).id;
  c = taskRepo.create({ user_id: mockUserId, title: 'Üçüncü' }).id;
});
afterEach(() => jest.restoreAllMocks());

async function startWith(u: Awaited<ReturnType<typeof renderUI>>, title: string) {
  // İlk test soğuk başlar; yük altında varsayılan 1 sn'lik bekleme yetmeyebilir.
  fireEvent(await u.findByText(title, {}, { timeout: 5000 }), 'longPress');
  expect(await u.findByText('1 seçili', {}, { timeout: 5000 })).toBeTruthy();
}

describe('Görevler: toplu seçim', () => {
  it('uzun basınca başlar, dokunarak seçilir, çarpıyla bırakılır', async () => {
    const u = await renderUI(<TasksScreen />);
    await startWith(u, 'Birinci');
    fireEvent.press(u.getByLabelText(pick('İkinci')));
    expect(await u.findByText('2 seçili')).toBeTruthy();
    fireEvent.press(u.getByLabelText(pick('İkinci'))); // seçimi kaldırır
    expect(await u.findByText('1 seçili')).toBeTruthy();
    fireEvent.press(u.getByLabelText('Seçimi bırak'));
    await waitFor(() => expect(u.queryByText('1 seçili')).toBeNull());
    expect(u.getAllByLabelText(edit('Birinci')).length).toBeGreaterThan(0);
  });

  it('seçilenleri tamamlar; Geri al hepsini açar', async () => {
    const u = await renderUI(<TasksScreen />);
    await startWith(u, 'Birinci');
    fireEvent.press(u.getByLabelText(pick('İkinci')));
    fireEvent.press(await u.findByText('Tamamla'));

    await waitFor(() => expect(taskRepo.getById(a)?.completed_at).not.toBeNull());
    expect(taskRepo.getById(b)?.completed_at).not.toBeNull();
    expect(taskRepo.getById(c)?.completed_at).toBeNull();
    expect(await u.findByText('2 görev tamamlandı')).toBeTruthy();

    fireEvent.press(u.getByText('Geri al'));
    expect(taskRepo.getById(a)?.completed_at).toBeNull();
    expect(taskRepo.getById(b)?.completed_at).toBeNull();
  });

  it('yarına alır, saati korur; Geri al eski tarihleri getirir', async () => {
    const u = await renderUI(<TasksScreen />);
    await startWith(u, 'İkinci');
    fireEvent.press(u.getByLabelText(pick('Üçüncü')));
    fireEvent.press(await u.findByText('Yarına al'));

    const tomorrow = shiftYmd(todayDate(), 1);
    await waitFor(() => expect(taskRepo.getById(b)?.due_date).toBe(`${tomorrow}T09:30:00`));
    expect(taskRepo.getById(c)?.due_date).toBe(tomorrow);
    fireEvent.press(await u.findByText('Geri al'));
    expect(taskRepo.getById(b)?.due_date).toBe(`${todayDate()}T09:30:00`);
    expect(taskRepo.getById(c)?.due_date).toBeNull();
  });

  it('siler: önce sorar; onaylanırsa siler, Geri al geri getirir', async () => {
    const u = await renderUI(<TasksScreen />);
    await startWith(u, 'Birinci');
    fireEvent.press(await u.findByText('Sil'));

    const calls = (Alert.alert as jest.Mock).mock.calls;
    const [title, , buttons] = calls[calls.length - 1] as [string, unknown, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Seçili 1 görev silinsin mi?');
    expect(taskRepo.getById(a)).not.toBeNull(); // henüz silinmedi
    await act(async () => buttons.find((x) => x.text === 'Sil')?.onPress?.());

    await waitFor(() => expect(taskRepo.getById(a)).toBeNull());
    expect(await u.findByText('1 görev silindi')).toBeTruthy();
    fireEvent.press(u.getByText('Geri al'));
    expect(taskRepo.getById(a)?.title).toBe('Birinci');
  });
});
