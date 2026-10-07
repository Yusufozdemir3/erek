// notifications.ts. expo-notifications is mocked here; the repos run on real
// in-memory SQLite, though most schedule calls get plain fixtures.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { setNotificationPref } from '@/lib/notificationPrefs';
import { habitRepo, reminderRepo, taskRepo, userRepo } from '@/db';
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
  scheduleWeeklyReview,
  sweepOrphanReminders,
  WEEKLY_REVIEW_ID,
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
  // Clean AsyncStorage: every preference at its default.
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

  // OS triggers repeat forever, so the lifespan is checked on every pass.
  it('HENÜZ BAŞLAMAMIŞ alışkanlıkta kurulmaz (başlangıç tarihi gelecekte)', async () => {
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

  // One scan of the scheduled list per pass, not one per entity.
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

describe('sweepOrphanReminders', () => {
  // Deleted on another device or wiped locally: no handler cancelled these.
  it('DB\'de karşılığı olmayan tetikleyicileri iptal eder, canlıları ve zamanlayıcıyı bırakır', async () => {
    const userId = userRepo.getOrCreateLocal().id;
    const habit = habitRepo.create({ user_id: userId, title: 'Su iç' });
    const deleted = habitRepo.create({ user_id: userId, title: 'Silinen' });
    const kept = reminderRepo.create('habit', habit.id, '08:00');
    const removed = reminderRepo.create('habit', habit.id, '20:00');
    const onDeleted = reminderRepo.create('habit', deleted.id, '09:00');
    reminderRepo.replaceAll('habit', habit.id, ['08:00']); // 20:00 removed
    habitRepo.softDelete(deleted.id);
    const task = taskRepo.create({ user_id: userId, title: 'Bitti', due_date: '2999-01-01' });
    const taskRem = reminderRepo.create('task', task.id, '10:00');
    taskRepo.setCompleted(task.id, true); // completed elsewhere -> no trigger should stay

    mockGetAll.mockResolvedValue([
      { identifier: `habit:${habit.id}:${kept.id}` },
      { identifier: `habit:${habit.id}:${kept.id}#3` }, // weekly suffix of a live reminder
      { identifier: `habit:${habit.id}:${removed.id}` },
      { identifier: `habit:${deleted.id}:${onDeleted.id}#i0` },
      { identifier: `task:${task.id}:${taskRem.id}` },
      { identifier: `timer:${habit.id}` },
      { identifier: 'something-else' },
    ]);

    const n = await sweepOrphanReminders(userId);

    const cancelled = mockCancel.mock.calls.map((c) => c[0]).sort();
    expect(cancelled).toEqual(
      [
        `habit:${habit.id}:${removed.id}`,
        `habit:${deleted.id}:${onDeleted.id}#i0`,
        `task:${task.id}:${taskRem.id}`,
      ].sort()
    );
    expect(n).toBe(3);
  });

  it('izin olmasa da çalışır (iptal izin gerektirmez)', async () => {
    const userId = userRepo.getOrCreateLocal().id;
    mockGetPerms.mockResolvedValue({ granted: false, canAskAgain: false });
    mockGetAll.mockResolvedValue([{ identifier: 'goal:yok:r1' }]);

    await sweepOrphanReminders(userId);

    expect(mockCancel).toHaveBeenCalledWith('goal:yok:r1');
  });
});

describe('scheduleWeeklyReview', () => {
  it('varsayılan kapalı: kurmaz ama eskisini temizler', async () => {
    expect(await scheduleWeeklyReview()).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith(WEEKLY_REVIEW_ID);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('açıkken Pazar 19:00 haftalık tetikleyici kurar; metin veriden bağımsız', async () => {
    await setNotificationPref('weeklyReview', true);
    expect(await scheduleWeeklyReview()).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const arg = mockSchedule.mock.calls[0][0];
    expect(arg.identifier).toBe(WEEKLY_REVIEW_ID);
    expect(arg.trigger).toMatchObject({ type: 'WEEKLY', weekday: 1, hour: 19, minute: 0 });
    expect(arg.content.title).toBe('Haftanın özeti hazır');
  });

  it('ana anahtar kapalıysa kurulmaz', async () => {
    await setNotificationPref('weeklyReview', true);
    await setNotificationPref('enabled', false);
    await scheduleWeeklyReview();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('izin yoksa false döner, kurmaz', async () => {
    await setNotificationPref('weeklyReview', true);
    mockGetPerms.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(await scheduleWeeklyReview()).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('yetim temizleyici haftalık özet bildirimine dokunmaz', async () => {
    mockGetAll.mockResolvedValueOnce([{ identifier: WEEKLY_REVIEW_ID }]);
    await sweepOrphanReminders('u1');
    expect(mockCancel).not.toHaveBeenCalledWith(WEEKLY_REVIEW_ID);
  });
});
