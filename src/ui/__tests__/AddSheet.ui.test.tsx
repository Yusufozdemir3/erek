// AddSheet component test — the central + menu (the most complex shared
// surface: all three forms). Notifications (requires expo-notifications) and
// router are mocked; taskRepo/habitRepo/goalRepo/subtaskRepo/goalMilestoneRepo/
// reminderRepo are REAL (in-memory SQLite) — same pattern as
// TaskEditModal.ui.test.tsx (end-to-end DB verification).

import { Alert } from 'react-native';
import { fireEvent, act } from '@testing-library/react-native';
import { goalMilestoneRepo, goalRepo, habitRepo, reminderRepo, taskRepo, userRepo } from '@/db';
import { AddSheet } from '@/ui/AddSheet';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockUserId = 'placeholder';
const mockNotifyDataChanged = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
}));

jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({
    user: { id: mockUserId },
    notifyDataChanged: mockNotifyDataChanged,
    selectedDate: '2026-01-15',
  }),
}));

jest.mock('@/lib/notifications', () => ({
  scheduleTaskReminders: jest.fn(async () => true),
  scheduleHabitReminders: jest.fn(async () => true),
  scheduleGoalReminders: jest.fn(async () => true),
}));

import { scheduleGoalReminders, scheduleHabitReminders, scheduleTaskReminders } from '@/lib/notifications';

async function pick(mode: 'date' | 'time', date: Date) {
  const cb = (globalThis as any).__pickers?.[mode];
  if (!cb) throw new Error(`"${mode}" seçici monte değil`);
  await act(async () => {
    cb(date);
  });
}

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  mockUserId = userRepo.getOrCreateLocal().id;
  jest.clearAllMocks();
});

describe('AddSheet — tür seçim menüsü', () => {
  it('üç seçenek görünür; birine dokununca ilgili forma geçer', async () => {
    const { getByText } = await renderUI(<AddSheet visible onClose={jest.fn()} />);
    expect(getByText('Görev')).toBeTruthy();
    expect(getByText('Alışkanlık')).toBeTruthy();
    expect(getByText('Hedef')).toBeTruthy();

    fireEvent.press(getByText('Alışkanlık'));
    expect(getByText('Yeni alışkanlık')).toBeTruthy();
  });

  it('"‹ Geri" menüye döner', async () => {
    const { getByText } = await renderUI(<AddSheet visible onClose={jest.fn()} initialStep="task" />);
    expect(getByText('Yeni görev')).toBeTruthy();
    fireEvent.press(getByText('‹ Geri'));
    expect(getByText('Ne eklemek istersin?')).toBeTruthy();
  });
});

describe('AddSheet — görev oluşturma', () => {
  it('başlık + taslak alt görevle oluşturur, hatırlatma kurar, listeye gider ve kapanır', async () => {
    const onClose = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <AddSheet visible onClose={onClose} initialStep="task" />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Fatura öde');
    // Draft subtask (available at creation time — enableSubtaskDraft).
    fireEvent.changeText(getByPlaceholderText('Alt görev ekle…'), 'Fişi tara');
    fireEvent.press(getByText('＋'));
    // Reminder time.
    fireEvent.press(getByText('＋ Saat ekle'));
    await pick('time', new Date(2026, 0, 1, 9, 0));

    await act(async () => {
      fireEvent.press(getByText('Ekle'));
    });

    const created = taskRepo.listByUser(mockUserId).find((t) => t.title === 'Fatura öde');
    expect(created).toBeTruthy();
    expect(reminderRepo.listByEntity('task', created!.id).map((r) => r.time)).toEqual(['09:00']);
    expect(scheduleTaskReminders).toHaveBeenCalledWith(
      expect.objectContaining({ id: created!.id }),
      expect.any(Array)
    );
    expect(mockNotifyDataChanged).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/tasks');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('AddSheet — alışkanlık oluşturma (sihirbaz)', () => {
  it('tip seçilip başlık girilip hatırlatma eklenince oluşturur; izin reddi uyarısı gösterir', async () => {
    (scheduleHabitReminders as jest.Mock).mockResolvedValueOnce(false); // permission-denied scenario
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { getByText, getByPlaceholderText } = await renderUI(
      <AddSheet visible onClose={jest.fn()} initialStep="habit" />
    );
    fireEvent.press(getByText('Basit (tik)'));
    fireEvent.press(getByText('İleri')); // -> identity
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Erken kalk');
    fireEvent.press(getByText('İleri')); // -> frequency
    fireEvent.press(getByText('İleri')); // -> reminder (binary+goalless: no tracking step)
    fireEvent.press(getByText('＋ Saat ekle'));
    await pick('time', new Date(2026, 0, 1, 7, 0));

    await act(async () => {
      fireEvent.press(getByText('Ekle'));
    });

    const created = habitRepo.listByUser(mockUserId).find((h) => h.title === 'Erken kalk');
    expect(created).toBeTruthy();
    expect(reminderRepo.listByEntity('habit', created!.id).map((r) => r.time)).toEqual(['07:00']);
    expect(alertSpy).toHaveBeenCalled();
  });
});

describe('AddSheet — hedef oluşturma', () => {
  it('parçalı (milestone) tip + taslak adımla oluşturur', async () => {
    const { getByText, getByPlaceholderText } = await renderUI(
      <AddSheet visible onClose={jest.fn()} initialStep="goal" />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Ev taşı');
    fireEvent.press(getByText('Parçalı'));
    fireEvent.changeText(getByPlaceholderText('Adım ekle…'), 'Kutuları topla');
    fireEvent.press(getByText('＋'));

    await act(async () => {
      fireEvent.press(getByText('Ekle'));
    });

    const created = goalRepo.listByUser(mockUserId).find((g) => g.title === 'Ev taşı');
    expect(created).toBeTruthy();
    expect(created!.goal_type).toBe('milestone');
    expect(goalMilestoneRepo.listByGoal(created!.id).map((m) => m.title)).toEqual(['Kutuları topla']);
    expect(scheduleGoalReminders).not.toHaveBeenCalled(); // no reminders were added
  });
});
