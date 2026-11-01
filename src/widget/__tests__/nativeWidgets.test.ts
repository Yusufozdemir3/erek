// Uygulama tarafı ↔ yerel widget'lar: veritabanından kurulan pano, yerel
// düğmelerin kuyruğunun SQLite'a yazılması, eski seçimlerin bir kez taşınması.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { userRepo } from '../../db/repositories/userRepo';
import { habitRepo } from '../../db/repositories/habitRepo';
import { resetTestDb } from '../../test/dbTestUtils';
import { todayDate } from '../../lib/helpers';
import { readPending } from '../widgetQueue';
import { PICKS_KEY } from '../widgetSnapshot';
import { addDaysYmd } from '../nativeWidgetsLogic';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Appearance: { getColorScheme: () => 'light' },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));
jest.mock('@/lib/notifications', () => ({
  refreshTaskReminders: async () => {},
  scheduleGeneralReminders: async () => true,
}));
jest.mock('@/i18n/I18nProvider', () => ({ getStoredLang: async () => 'tr' }));
// The icon set's components need the UI runtime; the board only uses its ids.
jest.mock('../../ui/habitIcons', () => ({
  resolveHabitIcon: (id: string) =>
    id === 'water' ? { family: 'ionicons', name: 'water-outline' } : id === 'target' ? { family: 'feather', name: 'target' } : undefined,
}));
// The JS widget library: nothing placed.
jest.mock('../renderWidgets', () => ({ updateWidgets: async () => {} }));

interface MockNative {
  board: string | null;
  queue: string;
  picks: string[];
  [fn: string]: unknown;
}
const mockNative: MockNative = {
  board: null,
  queue: '[]',
  picks: [] as string[],
  setBoard: jest.fn((json: string) => {
    mockNative.board = json;
  }),
  consumePending: jest.fn((): string => {
    const q: string = mockNative.queue;
    mockNative.queue = '[]';
    return q;
  }),
  patchHabit: jest.fn(),
  importPicks: jest.fn((json: string) => {
    mockNative.picks.push(json);
  }),
  addListener: jest.fn(() => ({ remove: () => {} })),
};
jest.mock('../../../modules/timer-notification/src/ErekWidgetsModule', () => ({ default: mockNative }));

import { buildNativeBoard } from '../nativeWidgets';
import { drainWidgetQueue, refreshWidget } from '../widgetData';

let uid: string;
const today = () => todayDate();

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  uid = userRepo.getOrCreateLocal().id;
  mockNative.board = null;
  mockNative.queue = '[]';
  mockNative.picks = [];
});

describe('buildNativeBoard', () => {
  it('etkin alışkanlıklar türü, bugünkü durumu, ikonu ve planlı günleriyle', async () => {
    const kitap = habitRepo.create({ user_id: uid, title: 'Kitap' });
    const su = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 8, icon: 'water', color: '#2266aa' });
    const oku = habitRepo.create({ user_id: uid, title: 'Oku', kind: 'timer', target_amount: 1200 });
    habitRepo.toggleLog(kitap.id, today(), true);
    habitRepo.incrementAmount(su.id, today(), 3, 8);
    habitRepo.incrementAmount(oku.id, today(), 300, 1200);

    const b = await buildNativeBoard(uid, []);
    expect(b.date).toBe(today());
    const by = Object.fromEntries(b.habits.map((h) => [h.id, h]));
    expect(by[kitap.id]).toMatchObject({ kind: 'binary', completed: true, icon: null });
    expect(by[su.id]).toMatchObject({ kind: 'numeric', amount: 3, target: 8, completed: false, color: '#2266aa' });
    expect(by[su.id].icon).toEqual({ f: 'ionicons', c: expect.any(Number) });
    expect(by[oku.id]).toMatchObject({ kind: 'timer', amount: 300, target: 1200 });
    // Every day: today and the next seven.
    expect(by[kitap.id].due).toHaveLength(8);
    expect(by[kitap.id].due[0]).toBe(today());
    expect(b.goalIcon).toEqual({ f: 'feather', c: expect.any(Number) });
  });

  it('haftalık plan: yalnız planlı günler; bitiş tarihinden sonrası yok', async () => {
    const day = new Date().getDay();
    const h = habitRepo.create({ user_id: uid, title: 'Haftalık', schedule: { freq: 'weekly', weekdays: [day] } });
    const ending = habitRepo.create({ user_id: uid, title: 'Bitiyor', end_date: addDaysYmd(today(), 1) });
    const b = await buildNativeBoard(uid, []);
    expect(b.habits.find((x) => x.id === h.id)?.due).toEqual([today(), addDaysYmd(today(), 7)]);
    expect(b.habits.find((x) => x.id === ending.id)?.due).toEqual([today(), addDaysYmd(today(), 1)]);
  });

  it('henüz yazılmamış JS widget dokunuşları panoda görünür', async () => {
    const su = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 2 });
    const b = await buildNativeBoard(uid, [
      { id: 'a', kind: 'inc', habitId: su.id, date: today(), delta: 1 },
      { id: 'b', kind: 'inc', habitId: su.id, date: today(), delta: 1 },
    ]);
    expect(b.habits[0]).toMatchObject({ amount: 2, completed: true });
  });

  it('tema: iki palet ve kip; etiketlerde yer tutucular yerel tarafa kalır', async () => {
    await AsyncStorage.setItem('theme:mode', 'dark');
    const b = await buildNativeBoard(uid, []);
    expect(b.mode).toBe('dark');
    expect(b.light.bg).not.toBe(b.dark.bg);
    expect(b.labels.today).toContain('{time}');
    expect(b.labels.minutes).toContain('{n}');
    expect(b.labels.more).toContain('{n}');
    expect(b.labels.pausedTemplate).toContain('{time}');
    expect(b.notify).toBe(true);
  });
});

describe('yerel düğmeler ↔ SQLite', () => {
  it('drain: yerel kuyruktaki dokunuşlar veritabanına yazılır', async () => {
    const kitap = habitRepo.create({ user_id: uid, title: 'Kitap' });
    const su = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 2 });
    mockNative.queue = JSON.stringify([
      { id: 'n1', kind: 'toggle', habitId: kitap.id, date: today(), completed: true },
      { id: 'n2', kind: 'inc', habitId: su.id, date: today(), delta: 1 },
      { id: 'n3', kind: 'inc', habitId: su.id, date: today(), delta: 1 },
    ]);

    expect(await drainWidgetQueue()).toBe(3);
    expect(habitRepo.isCompletedOn(kitap.id, today())).toBe(true);
    expect(habitRepo.getAmountOn(su.id, today())).toBe(2);
    expect(habitRepo.isCompletedOn(su.id, today())).toBe(true);
    expect(await readPending()).toEqual([]);
    expect(mockNative.queue).toBe('[]');
  });

  it('refreshWidget panoyu yayımlar; eski seçimler bir kez taşınır', async () => {
    habitRepo.create({ user_id: uid, title: 'Kitap' });
    await AsyncStorage.setItem(PICKS_KEY, JSON.stringify({ '12': 'kitap-id' }));

    await refreshWidget(uid);
    expect(mockNative.picks).toEqual([JSON.stringify({ '12': 'kitap-id' })]);
    expect(JSON.parse(mockNative.board!).habits).toHaveLength(1);
    expect(await AsyncStorage.getItem(PICKS_KEY)).toBeNull();

    await refreshWidget(uid);
    expect(mockNative.picks).toHaveLength(1);
  });
});
