// Bugün ekranında sesle işaretleme: söylenen cümle gerçek veritabanında
// alışkanlık/görev değiştirir, bildirim satırı sonucu söyler, Geri al çalışır.
// Tanıyıcı '@/lib/voice' üzerinden taklit edilir (bkz. TaskFormVoice testi).

import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TodayScreen from '../../../app/(tabs)/index';
import { renderUI } from '@/test/renderWithProviders';
import { resetTestDb } from '@/test/dbTestUtils';
import { habitRepo, taskRepo, userRepo } from '@/db';
import { todayDate } from '@/lib/helpers';

const mockListeners: Record<string, Set<(e: unknown) => void>> = {};
let mockUserId = '';
let mockSelectedDate = '';

jest.mock('@/lib/voice', () => {
  const React = require('react');
  return {
    getVoiceSupport: jest.fn(async () => 'onDevice'),
    getMicPermission: jest.fn(async () => 'granted'),
    requestMicPermission: jest.fn(async () => true),
    downloadOfflinePack: jest.fn(async () => 'done'),
    startListening: jest.fn(),
    stopListening: jest.fn(),
    abortListening: jest.fn(),
    useSpeechRecognitionEvent: (name: string, listener: (e: unknown) => void) => {
      const ref = React.useRef(listener);
      ref.current = listener;
      React.useEffect(() => {
        const fn = (e: unknown) => ref.current(e);
        (mockListeners[name] ??= new Set()).add(fn);
        return () => {
          mockListeners[name].delete(fn);
        };
      }, [name]);
    },
  };
});
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

async function emit(name: string, payload: unknown = null) {
  await act(async () => {
    mockListeners[name]?.forEach((l) => l(payload));
  });
}
const finalResult = (transcript: string) => ({ isFinal: true, results: [{ transcript, confidence: 1, segments: [] }] });

// Taps the mic, then delivers the sentence as the recognizer's final result.
async function say(u: Awaited<ReturnType<typeof renderUI>>, sentence: string) {
  fireEvent.press(await u.findByLabelText('Sesle işaretle'));
  await waitFor(() => expect(u.getByLabelText('Dinlemeyi bitir')).toBeTruthy());
  await emit('result', finalResult(sentence));
}

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockUserId = userRepo.getOrCreateLocal().id;
  mockSelectedDate = todayDate();
});

describe('Bugün: sesle işaretle', () => {
  it('"kitap okudum" ikili alışkanlığı işaretler, Geri al kaldırır', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    const u = await renderUI(<TodayScreen />);

    await say(u, 'kitap okudum');

    await waitFor(() => expect(habitRepo.isCompletedOn(h.id, todayDate())).toBe(true));
    expect(await u.findByText('“Kitap oku” işaretlendi')).toBeTruthy();

    fireEvent.press(u.getByText('Geri al'));
    expect(habitRepo.isCompletedOn(h.id, todayDate())).toBe(false);
    expect(await u.findByText('Geri alındı')).toBeTruthy();
  });

  it('"iki bardak su içtim" sayılı alışkanlığa +2 ekler, Geri al çıkarır', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Su iç', kind: 'numeric', target_amount: 8, unit: 'bardak' });
    const u = await renderUI(<TodayScreen />);

    await say(u, 'iki bardak su içtim');

    await waitFor(() => expect(habitRepo.getAmountOn(h.id, todayDate())).toBe(2));
    expect(await u.findByText('“Su iç”: +2 eklendi')).toBeTruthy();
    fireEvent.press(u.getByText('Geri al'));
    expect(habitRepo.getAmountOn(h.id, todayDate())).toBe(0);
  });

  it('görevi tamamlar; Geri al yeniden açar', async () => {
    habitRepo.create({ user_id: mockUserId, title: 'Başka' });
    const t = taskRepo.create({ user_id: mockUserId, title: 'Alışveriş yap', due_date: todayDate() });
    const u = await renderUI(<TodayScreen />);

    await say(u, 'alışveriş görevini bitirdim');

    await waitFor(() => expect(taskRepo.getById(t.id)?.completed_at).not.toBeNull());
    expect(await u.findByText('“Alışveriş yap” görevi tamamlandı')).toBeTruthy();
    fireEvent.press(u.getByText('Geri al'));
    expect(taskRepo.getById(t.id)?.completed_at).toBeNull();
  });

  it('zaten tamamlanmış alışkanlık: değişiklik yok, söyler', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    habitRepo.toggleLog(h.id, todayDate(), true);
    const u = await renderUI(<TodayScreen />);

    await say(u, 'kitap okudum');

    expect(await u.findByText('“Kitap oku” zaten tamamlanmış')).toBeTruthy();
    expect(u.queryByText('Geri al')).toBeNull();
  });

  it('komut olmayan cümle hiçbir şeyi değiştirmez ve görev de açmaz', async () => {
    const h = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    const u = await renderUI(<TodayScreen />);

    await say(u, 'yarın annemi ara');

    expect(await u.findByText(/komut olarak anlayamadım/)).toBeTruthy();
    expect(habitRepo.isCompletedOn(h.id, todayDate())).toBe(false);
    expect(taskRepo.listByUser(mockUserId)).toHaveLength(0);
  });

  it('belirsizse seçenek sunar; seçilen işaretlenir', async () => {
    const a = habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    const b = taskRepo.create({ user_id: mockUserId, title: 'Kitap oku bitir', due_date: todayDate() });
    habitRepo.create({ user_id: mockUserId, title: 'Başka alışkanlık' });
    const u = await renderUI(<TodayScreen />);

    await say(u, 'kitap okudum');

    const calls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = calls[calls.length - 1][2] as { text: string; onPress: () => void }[];
    expect(buttons.map((x) => x.text).sort()).toEqual(['Kitap oku', 'Kitap oku bitir']);
    await act(async () => {
      buttons.find((x) => x.text === 'Kitap oku')?.onPress();
    });
    expect(habitRepo.isCompletedOn(a.id, todayDate())).toBe(true);
    expect(taskRepo.getById(b.id)?.completed_at).toBeNull();
  });

  it('başka bir günü gösterirken mikrofon satırı yok', async () => {
    habitRepo.create({ user_id: mockUserId, title: 'Kitap oku' });
    mockSelectedDate = '2000-01-01';
    const u = await renderUI(<TodayScreen />);
    expect(u.queryByLabelText('Sesle işaretle')).toBeNull();
  });
});
