// Uygulama tarafı: widget kuyruğunu SQLite'a yazma ve anlık görüntüde bekleyen
// dokunuşların görünmesi.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { userRepo } from '../../db/repositories/userRepo';
import { habitRepo } from '../../db/repositories/habitRepo';
import { resetTestDb } from '../../test/dbTestUtils';
import { todayDate } from '../../lib/helpers';
import { appendPending, readPending, type WidgetAction } from '../widgetQueue';
import { readSnapshot } from '../widgetSnapshot';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' }, // yerel widget güncellemesi atlanır; anlık görüntü yine yazılır
  Appearance: { getColorScheme: () => 'light' },
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));
jest.mock('@/i18n/I18nProvider', () => ({ getStoredLang: async () => 'tr' }));

import { buildTodaySnapshot, drainWidgetQueue, refreshWidget } from '../widgetData';

let uid: string;
const today = () => todayDate();

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  uid = userRepo.getOrCreateLocal().id;
});

const toggle = (habitId: string, completed: boolean, id = 't-' + habitId): WidgetAction => ({
  id, kind: 'toggle', habitId, date: today(), completed,
});
const inc = (habitId: string, id: string): WidgetAction => ({ id, kind: 'inc', habitId, date: today(), delta: 1 });

describe('drainWidgetQueue', () => {
  it('işaretleme ve +1 veritabanına yazılır, kuyruk boşalır', async () => {
    const kitap = habitRepo.create({ user_id: uid, title: 'Kitap' });
    const su = habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 2, unit: 'bardak' });
    await appendPending(toggle(kitap.id, true));
    await appendPending(inc(su.id, 'i1'));
    await appendPending(inc(su.id, 'i2'));

    expect(await drainWidgetQueue()).toBe(3);

    expect(habitRepo.isCompletedOn(kitap.id, today())).toBe(true);
    expect(habitRepo.getAmountOn(su.id, today())).toBe(2);
    expect(habitRepo.isCompletedOn(su.id, today())).toBe(true); // hedefe ulaştı
    expect(await readPending()).toEqual([]);
  });

  it('aynı işaretleme iki kez gelirse sonuç değişmez (hedef durum yazılıyor)', async () => {
    const h = habitRepo.create({ user_id: uid, title: 'Kitap' });
    await appendPending(toggle(h.id, true, 'a'));
    await appendPending(toggle(h.id, true, 'b'));
    await drainWidgetQueue();
    expect(habitRepo.isCompletedOn(h.id, today())).toBe(true);
  });

  it('silinmiş ya da türü değişmiş alışkanlığın dokunuşu düşer, diğerleri yazılır', async () => {
    const gone = habitRepo.create({ user_id: uid, title: 'Silinen' });
    habitRepo.softDelete(gone.id);
    const nowNumeric = habitRepo.create({ user_id: uid, title: 'Artık sayılı', kind: 'numeric', target_amount: 3 });
    const ok = habitRepo.create({ user_id: uid, title: 'Kitap' });
    await appendPending(toggle(gone.id, true));
    await appendPending(toggle(nowNumeric.id, true));
    await appendPending(toggle(ok.id, true));

    expect(await drainWidgetQueue()).toBe(1);
    expect(habitRepo.isCompletedOn(ok.id, today())).toBe(true);
    expect(habitRepo.getAmountOn(nowNumeric.id, today())).toBe(0);
    expect(await readPending()).toEqual([]);
  });

  it('boş kuyruk: 0, veritabanına dokunulmaz', async () => {
    expect(await drainWidgetQueue()).toBe(0);
  });
});

describe('anlık görüntü', () => {
  it('tür, miktar, hedef ve birim widget’a taşınır; çeviri metinleri dolu', async () => {
    habitRepo.create({ user_id: uid, title: 'Su', kind: 'numeric', target_amount: 8, unit: 'bardak' });
    const s = await buildTodaySnapshot(uid);
    expect(s.habits[0]).toMatchObject({ kind: 'numeric', amount: 0, target: 8, unit: 'bardak', completed: false });
    expect(s.summaryTemplate).toContain('{done}');
    expect(s.staleLabel).toBeTruthy();
    expect(s.counterTitle).toBeTruthy();
    expect(s.counterEmptyLabel).toBeTruthy();
  });

  it('henüz yazılmamış dokunuş yenilemede kaybolmaz (üstüne bindirilir)', async () => {
    const h = habitRepo.create({ user_id: uid, title: 'Kitap' });
    await appendPending(toggle(h.id, true));

    await refreshWidget(uid);

    const s = await readSnapshot();
    expect(s?.habits[0].completed).toBe(true);
    expect(s?.doneCount).toBe(1);
    expect(habitRepo.isCompletedOn(h.id, today())).toBe(false); // veritabanına yenileme yazmaz
  });
});
