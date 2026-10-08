// Bugün: alışkanlık kartına uzun basınca menü açılır — bugünü mola yap (yalnız
// bugün ve başlanmamışken) ya da istatistiği aç.

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent } from '@testing-library/react-native';
import TodayScreen from '../../../app/(tabs)/index';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { habitRepo, userRepo } from '@/db';
import { shiftYmd, todayDate } from '@/lib/helpers';

let mockUserId = '';
let mockSelectedDate = '';
let mockRunning = false;
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
    router: { push: (...a: unknown[]) => mockPush(...a) },
  };
});
jest.mock('@/ui/AppData', () => {
  const app = () => ({
    user: { id: mockUserId },
    selectedDate: mockSelectedDate,
    setSelectedDate: jest.fn(),
    dataVersion: 0,
    notifyDataChanged: jest.fn(),
  });
  return { useAppData: app, useOptionalAppData: app };
});
jest.mock('@/ui/TimerProvider', () => ({
  useTimer: () => ({ isRunning: () => mockRunning, liveSeconds: () => null, start: jest.fn(), pause: jest.fn(), reset: jest.fn() }),
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
  const A: any = { View: RN.View, createAnimatedComponent: (c: unknown) => c };
  return { __esModule: true, default: A, LinearTransition: { duration: () => ({}) } };
});

jest.setTimeout(20000);
const SLOW = { timeout: 5000 };

type Button = { text: string; onPress?: () => void; style?: string };
let alert: jest.SpyInstance;
const lastButtons = (): Button[] => alert.mock.calls[alert.mock.calls.length - 1][2] as Button[];
const labels = () => lastButtons().map((b) => b.text);
const press = (text: string) => lastButtons().find((b) => b.text === text)!.onPress!();

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  mockUserId = userRepo.getOrCreateLocal().id;
  mockSelectedDate = todayDate();
  mockRunning = false;
  mockPush.mockClear();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('Bugün: alışkanlık kartına uzun basma', () => {
  it('başlanmamış alışkanlığı bugün mola yapar; kart mola satırına döner', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    const u = await renderUI(<TodayScreen />);
    fireEvent(await u.findByText('Kitap oku', {}, SLOW), 'longPress');
    expect(alert.mock.calls[0][0]).toBe('Kitap oku');
    expect(labels()).toEqual(['Bugünü mola yap', 'İstatistiği aç', 'İptal']);

    press('Bugünü mola yap');
    expect(habitRepo.getById(h.id)!.skip_dates).toEqual([todayDate()]);
    expect(await u.findByText('Mola günü — seri bozulmaz')).toBeTruthy();
    expect(u.getByLabelText('Kitap oku için mola gününü kaldır')).toBeTruthy();
  });

  it('günün tek alışkanlığı molaya çıkınca "filtreye uyan yok" değil mola satırı görünür; Geri al çalışır', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    habitRepo.setSkipped(h.id, todayDate(), true);
    const u = await renderUI(<TodayScreen />);
    fireEvent.press(await u.findByLabelText('Kitap oku için mola gününü kaldır', {}, SLOW));
    expect(habitRepo.getById(h.id)!.skip_dates ?? []).toEqual([]);
    expect(await u.findByText('Kitap oku')).toBeTruthy();
  });

  it('tamamlanmış alışkanlıkta yalnız istatistik var; istatistik ekranına gider', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    habitRepo.toggleLog(h.id, todayDate(), true);
    const u = await renderUI(<TodayScreen />);
    // Done habits fold under "Tamamlananlar".
    fireEvent.press(await u.findByText(/Tamamlananlar/, {}, SLOW));
    fireEvent(u.getByText('Kitap oku'), 'longPress');
    expect(labels()).toEqual(['İstatistiği aç', 'İptal']);
    press('İstatistiği aç');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/habit/[id]', params: { id: h.id } });
  });

  it('sayılmaya başlanmış sayısal alışkanlıkta mola sunulmaz', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Su', kind: 'numeric', target_amount: 8, unit: 'bardak' });
    habitRepo.incrementAmount(h.id, todayDate(), 2, 8);
    const u = await renderUI(<TodayScreen />);
    fireEvent(await u.findByText('Su', {}, SLOW), 'longPress');
    expect(labels()).toEqual(['İstatistiği aç', 'İptal']);
  });

  it('zamanlayıcısı çalışan alışkanlıkta mola sunulmaz', async () => {
    habitRepo.create({ user_id: mockUserId, title: 'Meditasyon', kind: 'timer', target_amount: 600 });
    mockRunning = true;
    const u = await renderUI(<TodayScreen />);
    fireEvent(await u.findByText('Meditasyon', {}, SLOW), 'longPress');
    expect(labels()).toEqual(['İstatistiği aç', 'İptal']);
  });

  it('geçmiş bir güne bakarken mola sunulmaz', async () => {
    habitRepo.create({ user_id: mockUserId, title: 'Kitap oku', start_date: shiftYmd(todayDate(), -5) });
    mockSelectedDate = shiftYmd(todayDate(), -1);
    const u = await renderUI(<TodayScreen />);
    fireEvent(await u.findByText('Kitap oku', {}, SLOW), 'longPress');
    expect(labels()).toEqual(['İstatistiği aç', 'İptal']);
  });
});
