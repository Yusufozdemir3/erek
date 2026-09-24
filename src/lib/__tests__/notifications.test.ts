// notifications.ts tests — the multi-reminder logic rewritten from scratch in
// this session had no tests at all. expo-notifications is a real native
// module, so it's mocked (scoped to this file only); reminderRepo/goalRepo are
// REAL (in-memory SQLite) — the Reminder/Goal/Habit/Task objects the schedule
// functions receive are plain test fixtures that don't need to be written to
// the DB (only the reschedule-all tests read real rows via reminderRepo).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { setNotificationPref } from '@/lib/notificationPrefs';
import { reminderRepo } from '@/db';
import type { Goal, Habit, Reminder, Task } from '@/db';
import { resetTestDb } from '@/test/dbTestUtils';
import {
  cancelGoalReminders,
  cancelHabitReminders,
  cancelTaskReminders,
  migrateToMultiReminderIfNeeded,
  rescheduleAllGoalReminders,
  rescheduleAllReminders,
  rescheduleAllTaskReminders,
  scheduleGoalReminders,
  scheduleHabitReminders,
  scheduleTaskReminders,
} from '@/lib/notifications';

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  deleteNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'DAILY', WEEKLY: 'WEEKLY', DATE: 'DATE', TIME_INTERVAL: 'TIME_INTERVAL' },
  AndroidImportance: { DEFAULT: 3 },
}));

// getStoredLang can fall back to expo-localization (device language) — not
// needed in tests; replaced with a stub that returns a fixed 'tr'.
jest.mock('@/i18n/I18nProvider', () => ({ getStoredLang: jest.fn(async () => 'tr') }));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const mockCancelAll = Notifications.cancelAllScheduledNotificationsAsync as jest.Mock;
const mockGetPerms = Notifications.getPermissionsAsync as jest.Mock;

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    user_id: 'u1',
    goal_id: null,
    title: 'Su iç',
    kind: 'binary',
    icon: null,
    color: null,
    schedule: null,
    target_amount: null,
    unit: null,
    start_date: null,
    end_date: null,
    goal_contribution: null,
    goal_factor: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    synced: 0,
    ...overrides,
  } as Habit;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    user_id: 'u1',
    title: 'Fatura öde',
    due_date: '2999-01-01',
    end_time: null,
    priority: 'medium',
    recurrence: null,
    completed_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    synced: 0,
    ...overrides,
  } as Task;
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    user_id: 'u1',
    title: 'Kitap oku',
    goal_type: 'numeric',
    target_value: 100,
    current_value: 10,
    value_baseline: 10, // for a goal with no entries, the entire value is in the baseline
    unit: 'sayfa',
    deadline: '2999-01-01',
    completed_at: null,
    start_date: '2026-01-01',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    synced: 0,
    ...overrides,
  } as Goal;
}

function makeReminder(time: string, id = `r-${time}`): Reminder {
  return { id, entity_type: 'habit', entity_id: 'habit-1', time, updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null, synced: 0 };
}

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear(); // notification preferences are also kept here — mustn't leak between tests
  jest.clearAllMocks();
  mockGetAll.mockResolvedValue([]);
  mockGetPerms.mockResolvedValue({ granted: true, canAskAgain: true });
  // Since AsyncStorage is clean, getNotificationPrefs returns everything on (the default).
});

describe('cancelByPrefix (cancelHabitReminders/cancelTaskReminders/cancelGoalReminders)', () => {
  it('yalnızca ilgili önekle başlayan bildirimleri iptal eder', async () => {
    mockGetAll.mockResolvedValue([
      { identifier: 'habit:habit-1:r1' },
      { identifier: 'habit:habit-1:r2#3' },
      { identifier: 'habit:habit-2:r9' }, // a different habit — must not be touched
      { identifier: 'task:habit-1:r1' }, // different entity type but a similar id — must not be touched
    ]);

    await cancelHabitReminders('habit-1');

    expect(mockCancel).toHaveBeenCalledTimes(2);
    expect(mockCancel).toHaveBeenCalledWith('habit:habit-1:r1');
    expect(mockCancel).toHaveBeenCalledWith('habit:habit-1:r2#3');
  });

  it('eski tekil format (bare id / task:{id}) yeni önekle EŞLEŞMEZ — geçiş riski budur', async () => {
    mockGetAll.mockResolvedValue([{ identifier: 'habit-1' }, { identifier: 'task:task-1' }]);

    await cancelHabitReminders('habit-1');
    await cancelTaskReminders('task-1');

    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('hiç kurulu bildirim yoksa sessizce hiçbir şey yapmaz', async () => {
    await cancelGoalReminders('goal-1');
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('scheduleHabitReminders', () => {
  it('her gün + tek hatırlatma: DAILY tetikleyici, identifier habit:{id}:{reminderId}', async () => {
    const ok = await scheduleHabitReminders(makeHabit(), [makeReminder('08:00')]);
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const call = mockSchedule.mock.calls[0][0];
    expect(call.identifier).toBe('habit:habit-1:r-08:00');
    expect(call.trigger).toMatchObject({ type: 'DAILY', hour: 8, minute: 0 });
  });

  it('birden fazla hatırlatma: her biri için ayrı schedule çağrısı', async () => {
    await scheduleHabitReminders(makeHabit(), [makeReminder('08:00'), makeReminder('20:30')]);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const ids = mockSchedule.mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual(['habit:habit-1:r-08:00', 'habit:habit-1:r-20:30']);
  });

  it('belirli günler (weekly): her hatırlatma × her seçili gün için ayrı WEEKLY tetikleyici', async () => {
    const habit = makeHabit({ schedule: { freq: 'weekly', weekdays: [1, 3] } });
    await scheduleHabitReminders(habit, [makeReminder('09:00')]);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const calls = mockSchedule.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.identifier).sort()).toEqual(['habit:habit-1:r-09:00#1', 'habit:habit-1:r-09:00#3'].sort());
    expect(calls[0].trigger).toMatchObject({ type: 'WEEKLY', hour: 9, minute: 0 });
  });

  it('reminders boşsa hiçbir şey kurmaz ama önce iptal eder', async () => {
    mockGetAll.mockResolvedValue([{ identifier: 'habit:habit-1:old' }]);
    const ok = await scheduleHabitReminders(makeHabit(), []);
    expect(ok).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith('habit:habit-1:old');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  // Lifetime range: OS triggers (DAILY/WEEKLY) don't know about dates, they
  // repeat forever. That's why the range is checked here on every scheduling pass.
  it('HENÜZ BAŞLAMAMIŞ alışkanlıkta kurulmaz (başlangıç tarihi gelecekte)', async () => {
    // A user who said "start on Sept 1" shouldn't get notifications starting
    // today; the habit also doesn't show up in lists (useTodayData filters the same range).
    const habit = makeHabit({ start_date: '2999-01-01' });

    const ok = await scheduleHabitReminders(habit, [makeReminder('08:00')]);

    expect(ok).toBe(true);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('başlangıç tarihi BUGÜN ya da geçmişse normal kurulur', async () => {
    await scheduleHabitReminders(makeHabit({ start_date: '2020-01-01' }), [makeReminder('08:00')]);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('bitiş tarihi geçmişse kurulmaz', async () => {
    const habit = makeHabit({ end_date: '2020-01-01' });
    const ok = await scheduleHabitReminders(habit, [makeReminder('08:00')]);
    expect(ok).toBe(true);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('habitReminders tercihi kapalıysa kurulmaz (ana anahtar açık kalsa bile)', async () => {
    await setNotificationPref('habitReminders', false);
    const ok = await scheduleHabitReminders(makeHabit(), [makeReminder('08:00')]);
    expect(ok).toBe(true);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('izin reddedilirse false döner ve hiçbir şey kurmaz', async () => {
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    const ok = await scheduleHabitReminders(makeHabit(), [makeReminder('08:00')]);
    expect(ok).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('bozuk saat sessizce atlanır, diğer hatırlatmalar kurulur', async () => {
    await scheduleHabitReminders(makeHabit(), [makeReminder('99:99'), makeReminder('08:00')]);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].identifier).toBe('habit:habit-1:r-08:00');
  });
});

describe('scheduleTaskReminders', () => {
  it('geçerli görevde DATE tetikleyici kurar (identifier task:{id}:{reminderId})', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'task', entity_id: 'task-1', time: '09:00', updated_at: '', deleted_at: null, synced: 0 };
    const ok = await scheduleTaskReminders(makeTask(), [reminder]);
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const call = mockSchedule.mock.calls[0][0];
    expect(call.identifier).toBe('task:task-1:r1');
    expect(call.trigger.type).toBe('DATE');
  });

  it('tamamlanmış görevde kurulmaz', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'task', entity_id: 'task-1', time: '09:00', updated_at: '', deleted_at: null, synced: 0 };
    await scheduleTaskReminders(makeTask({ completed_at: '2026-01-01T00:00:00.000Z' }), [reminder]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('son tarihi geçmiş bir saat için schedule çağrılmaz', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'task', entity_id: 'task-1', time: '09:00', updated_at: '', deleted_at: null, synced: 0 };
    await scheduleTaskReminders(makeTask({ due_date: '2000-01-01' }), [reminder]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('due_date yoksa hiç kurulmaz', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'task', entity_id: 'task-1', time: '09:00', updated_at: '', deleted_at: null, synced: 0 };
    await scheduleTaskReminders(makeTask({ due_date: null }), [reminder]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe('scheduleGoalReminders', () => {
  it('geçerli sayısal hedefte DAILY tetikleyici kurar (identifier goal:{id}:{reminderId})', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'goal', entity_id: 'goal-1', time: '08:30', updated_at: '', deleted_at: null, synced: 0 };
    const ok = await scheduleGoalReminders(makeGoal(), [reminder]);
    expect(ok).toBe(true);
    const call = mockSchedule.mock.calls[0][0];
    expect(call.identifier).toBe('goal:goal-1:r1');
    expect(call.trigger).toMatchObject({ type: 'DAILY', hour: 8, minute: 30 });
  });

  it('tamamlanmış (current>=target) sayısal hedefte kurulmaz', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'goal', entity_id: 'goal-1', time: '08:30', updated_at: '', deleted_at: null, synced: 0 };
    await scheduleGoalReminders(makeGoal({ current_value: 100, target_value: 100 }), [reminder]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('son tarihi geçmiş hedefte kurulmaz', async () => {
    const reminder: Reminder = { id: 'r1', entity_type: 'goal', entity_id: 'goal-1', time: '08:30', updated_at: '', deleted_at: null, synced: 0 };
    await scheduleGoalReminders(makeGoal({ deadline: '2000-01-01' }), [reminder]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe('rescheduleAllReminders / rescheduleAllTaskReminders / rescheduleAllGoalReminders', () => {
  it('yalnızca DB’de gerçekten hatırlatması olan varlıkları yeniden kurar', async () => {
    reminderRepo.create('habit', 'h1', '08:00');
    const habits = [makeHabit({ id: 'h1' }), makeHabit({ id: 'h2' })]; // h2 has no reminder at all

    await rescheduleAllReminders(habits);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].identifier).toMatch(/^habit:h1:/);
  });

  it('izin yoksa açılışta hiçbir şey kurmaz (izin akışı tetiklenmez)', async () => {
    reminderRepo.create('habit', 'h1', '08:00');
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: true });

    await rescheduleAllReminders([makeHabit({ id: 'h1' })]);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  // Every scheduleX call first does a cancelX, which pulls ALL currently
  // scheduled notifications from the native bridge. If this scan repeats per
  // entity, the startup cost grows linearly with the entity count (80
  // entities = 80 full scans, all sequential). There should be ONE scan per
  // pass — this test locks in that gain.
  it('varlık sayısından bağımsız olarak kurulu bildirimleri TEK kez tarar', async () => {
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5']) reminderRepo.create('habit', id, '08:00');
    const habits = ['h1', 'h2', 'h3', 'h4', 'h5'].map((id) => makeHabit({ id }));

    await rescheduleAllReminders(habits);

    expect(mockSchedule).toHaveBeenCalledTimes(5); // all five were scheduled
    expect(mockGetAll).toHaveBeenCalledTimes(1); // but the scan was done once
  });

  it('eski tetikleyiciler toplu turda da iptal edilir (anlık görüntü kullanılır)', async () => {
    reminderRepo.create('habit', 'h1', '08:00');
    reminderRepo.create('habit', 'h2', '08:00');
    mockGetAll.mockResolvedValue([
      { identifier: 'habit:h1:eski' },
      { identifier: 'habit:h2:eski' },
      { identifier: 'timer:h1' }, // a timer notification — must NOT be touched
    ]);

    await rescheduleAllReminders([makeHabit({ id: 'h1' }), makeHabit({ id: 'h2' })]);

    const cancelled = mockCancel.mock.calls.map((c) => c[0]);
    expect(cancelled).toContain('habit:h1:eski');
    expect(cancelled).toContain('habit:h2:eski');
    expect(cancelled).not.toContain('timer:h1');
  });

  it('görev: yalnız tamamlanmamış + son tarihli + hatırlatmalı görevleri kurar', async () => {
    reminderRepo.create('task', 't1', '09:00');
    reminderRepo.create('task', 't2', '09:00'); // t2 is completed — must be filtered out

    await rescheduleAllTaskReminders([
      makeTask({ id: 't1' }),
      makeTask({ id: 't2', completed_at: '2026-01-01T00:00:00.000Z' }),
    ]);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].identifier).toMatch(/^task:t1:/);
  });

  it('hedef: hatırlatması olan hedefleri kurar', async () => {
    reminderRepo.create('goal', 'g1', '08:30');
    await rescheduleAllGoalReminders([makeGoal({ id: 'g1' })]);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].identifier).toMatch(/^goal:g1:/);
  });
});

describe('migrateToMultiReminderIfNeeded', () => {
  it('ilk çağrıda tüm zamanlanmış bildirimleri nuke eder, sonraki çağrıda etmez', async () => {
    await migrateToMultiReminderIfNeeded();
    expect(mockCancelAll).toHaveBeenCalledTimes(1);

    await migrateToMultiReminderIfNeeded();
    expect(mockCancelAll).toHaveBeenCalledTimes(1); // didn't increase the second time
  });
});
