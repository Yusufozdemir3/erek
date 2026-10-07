// TimerProvider's restore after the process died, on real AsyncStorage and
// SQLite: the pure functions are tested in timerLogic.test.ts, this checks
// they're wired right (what actually lands in the DB). Dates use todayDate()
// (local), as the provider does — UTC would flake by time zone.

import { useEffect } from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, waitFor } from '@testing-library/react-native';
import { habitRepo, userRepo } from '@/db';
import { todayDate } from '@/lib/helpers';
import { emitLocalDataWillChange } from '@/lib/localDataEvents';
import { getDb } from '@/db/database';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { TimerProvider, useTimer } from '@/ui/TimerProvider';

const ACTIVE_KEY = 'timer:active';
const DAY_MS = 86_400_000;
const mockNotifyDataChanged = jest.fn();

function daysAgo(n: number): string {
  const d = new Date(`${todayDate()}T00:00:00`);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ notifyDataChanged: mockNotifyDataChanged }),
}));

// Canceling notifications is a side effect; not the subject of this test.
jest.mock('@/lib/notifications', () => ({
  cancelTimerDone: jest.fn(async () => {}),
  scheduleTimerDone: jest.fn(async () => {}),
}));

jest.mock('@/lib/haptics', () => ({ notifySuccess: jest.fn() }));

// A tiny probe that leaks TimerProvider's context out — all the test needs is
// to see that `active()` is null after the restore.
function Probe({ onReady }: { onReady: (api: ReturnType<typeof useTimer>) => void }) {
  const timer = useTimer();
  useEffect(() => {
    onReady(timer);
  }, [timer, onReady]);
  return <Text />;
}

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  userId = userRepo.getOrCreateLocal().id;
  mockNotifyDataChanged.mockClear();
});

describe('TimerProvider — süreç ölümünden sonra geri yükleme', () => {
  it('İKİ GÜN KAPALI KALAN SEANS: DB\'ye 48 saat değil, hedefe kalan kadarı yazılır', async () => {
    // Killed overnight, reopened two days later: only the 20 minutes may be booked.
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 20 * 60, // 20-min target
    });
    const yesterday = daysAgo(2);
    // Persisted state: started two days ago, dated that day, with zero accumulation.
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: yesterday,
        startedAt: Date.now() - 2 * DAY_MS,
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    // waitFor, since one act() may not flush the async restore under load.
    await waitFor(() => expect(habitRepo.getAmountOn(habit.id, yesterday)).toBe(20 * 60));

    // The session MUST close — it shouldn't keep running with a stale session.
    expect(api!.active()).toBeNull();
    expect(api!.isRunning('habit', habit.id)).toBe(false);
    // Persisted state was cleared — the same session won't be reprocessed on the next open.
    expect(await AsyncStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it('TAZE SEANS (aynı gün, hedef dolmamış): olduğu yerden devam eder', async () => {
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 20 * 60,
    });
    const today = todayDate();
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: today,
        startedAt: Date.now() - 5 * 60_000, // started 5 min ago
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    // A short crash/restart session must NOT break it — it's still considered running.
    await waitFor(() => expect(api!.isRunning('habit', habit.id)).toBe(true));
    // Nothing has been WRITTEN to the DB yet — commit only happens on pause/finish.
    expect(habitRepo.getAmountOn(habit.id, today)).toBe(0);
  });

  it('kapalıyken hedef TAM dolmuşsa (bayat + hedefte) seans kapanır, hedef kadar yazılır', async () => {
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 10 * 60,
    });
    const today = todayDate();
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: today,
        startedAt: Date.now() - 30 * 60_000, // started 30 min ago — already exceeded the 10-min target
        baseSeconds: 0,
        targetSeconds: 10 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    await waitFor(() => expect(habitRepo.getAmountOn(habit.id, today)).toBe(10 * 60)); // the target amount, not 30 min
    expect(api!.active()).toBeNull();
  });

  it('kalıcı durum yoksa hiçbir şey yapmaz (temiz açılış)', async () => {
    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    await waitFor(() => expect(api).not.toBeNull());
    expect(api!.active()).toBeNull();
  });
});

describe('TimerProvider — yerel veri toptan değişirken (hesap birleştirme / silme)', () => {
  // After a merge the running timer's old habit id is gone; pausing must not crash.
  it('değişimden ÖNCE çalışan süreyi yazar ve seansı kapatır', async () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Kitap oku', kind: 'timer', target_amount: 20 * 60 });
    const today = todayDate();
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: today,
        startedAt: Date.now() - 5 * 60_000,
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );
    await waitFor(() => expect(api!.isRunning('habit', habit.id)).toBe(true));

    await act(async () => {
      emitLocalDataWillChange();
    });

    const written = habitRepo.getAmountOn(habit.id, today);
    expect(written).toBeGreaterThanOrEqual(5 * 60 - 2);
    expect(written).toBeLessThanOrEqual(5 * 60 + 2);
    expect(api!.active()).toBeNull();
    expect(await AsyncStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it('alışkanlık artık yoksa duraklatmak çökmez (hiçbir şey yazılmaz)', async () => {
    const habit = habitRepo.create({ user_id: userId, title: 'Kitap oku', kind: 'timer', target_amount: 20 * 60 });
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: todayDate(),
        startedAt: Date.now() - 60_000,
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );
    await waitFor(() => expect(api!.isRunning('habit', habit.id)).toBe(true));

    // The row vanishes under the running timer (e.g. local data cleared elsewhere).
    getDb().runSync(`DELETE FROM habits WHERE id = ?`, [habit.id]);

    await act(async () => {
      expect(() => api!.pause()).not.toThrow();
    });
    expect(api!.active()).toBeNull();
  });
});
