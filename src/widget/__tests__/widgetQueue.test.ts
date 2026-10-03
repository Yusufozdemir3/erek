// Widget dokunuşları: tıklamadan işlem çıkarma, anlık (iyimser) görünüm,
// bekleyen kuyruk ve sıralı yazma.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INC_ACTION,
  PENDING_KEY,
  TOGGLE_ACTION,
  actionFromClick,
  appendPending,
  applyAll,
  applyToSnapshot,
  emitWidgetAction,
  isStale,
  localYmd,
  onWidgetAction,
  readPending,
  removePending,
  serialized,
  type WidgetAction,
} from '../widgetQueue';
import { FALLBACK_COLORS, type WidgetSnapshot } from '../widgetSnapshot';

const TODAY = '2026-10-03';

function snap(over: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    date: TODAY,
    dateLabel: '3 Ekim',
    title: 'Bugün',
    summaryLabel: '1/3 tamamlandı',
    summaryTemplate: '{done}/{total} tamamlandı',
    emptyLabel: 'boş',
    doneCount: 1,
    totalCount: 3,
    colors: FALLBACK_COLORS,
    habits: [
      { id: 'kitap', title: 'Kitap oku', color: '#111111', completed: false, kind: 'binary' },
      { id: 'su', title: 'Su iç', color: '#222222', completed: false, kind: 'numeric', amount: 6, target: 8, unit: 'bardak' },
      { id: 'yoga', title: 'Yoga', color: '#333333', completed: true, kind: 'timer' },
    ],
    ...over,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('actionFromClick', () => {
  it('ikili alışkanlık: tersine çevrilmiş HEDEF durum yazılır (çift uygulanırsa zararsız)', () => {
    expect(actionFromClick(snap(), TOGGLE_ACTION, { habitId: 'kitap' }, 'a1', TODAY)).toEqual({
      id: 'a1', kind: 'toggle', habitId: 'kitap', date: TODAY, completed: true,
    });
  });

  it('sayılı alışkanlık: +1', () => {
    expect(actionFromClick(snap(), INC_ACTION, { habitId: 'su' }, 'a2', TODAY)).toEqual({
      id: 'a2', kind: 'inc', habitId: 'su', date: TODAY, delta: 1,
    });
  });

  it('yanlış türde dokunuş, bilinmeyen alışkanlık, bilinmeyen eylem: hiçbir şey yapılmaz', () => {
    expect(actionFromClick(snap(), TOGGLE_ACTION, { habitId: 'su' }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(snap(), INC_ACTION, { habitId: 'kitap' }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(snap(), TOGGLE_ACTION, { habitId: 'yoga' }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(snap(), TOGGLE_ACTION, { habitId: 'yok' }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(snap(), TOGGLE_ACTION, { habitId: 42 }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(snap(), 'SOMETHING', { habitId: 'kitap' }, 'x', TODAY)).toBeNull();
    expect(actionFromClick(null, TOGGLE_ACTION, { habitId: 'kitap' }, 'x', TODAY)).toBeNull();
  });

  it('dünkü anlık görüntüye dokunmak dünü işaretlemez', () => {
    const old = snap({ date: '2026-10-02' });
    expect(isStale(old, TODAY)).toBe(true);
    expect(actionFromClick(old, TOGGLE_ACTION, { habitId: 'kitap' }, 'x', TODAY)).toBeNull();
  });

  it('eski sürümün anlık görüntüsü (kind yok) ikili sayılır', () => {
    const legacy = snap({ habits: [{ id: 'k', title: 'K', color: '#000000', completed: false }] });
    expect(actionFromClick(legacy, TOGGLE_ACTION, { habitId: 'k' }, 'x', TODAY)?.kind).toBe('toggle');
  });
});

describe('applyToSnapshot', () => {
  const toggle = (completed: boolean): WidgetAction => ({ id: 't', kind: 'toggle', habitId: 'kitap', date: TODAY, completed });
  const inc: WidgetAction = { id: 'i', kind: 'inc', habitId: 'su', date: TODAY, delta: 1 };

  it('işaretleme sayacı ve özeti günceller', () => {
    const next = applyToSnapshot(snap(), toggle(true));
    expect(next.habits[0].completed).toBe(true);
    expect(next.doneCount).toBe(2);
    expect(next.summaryLabel).toBe('2/3 tamamlandı');
  });

  it('+1 hedefe ulaşınca tamamlanır', () => {
    const once = applyToSnapshot(snap(), inc);
    expect(once.habits[1]).toMatchObject({ amount: 7, completed: false });
    const twice = applyToSnapshot(once, { ...inc, id: 'i2' });
    expect(twice.habits[1]).toMatchObject({ amount: 8, completed: true });
    expect(twice.summaryLabel).toBe('2/3 tamamlandı');
  });

  it('hedefsiz sayılı alışkanlık hiç "tamamlanmaz"', () => {
    const s = snap();
    s.habits[1] = { ...s.habits[1], target: null };
    expect(applyToSnapshot(s, inc).habits[1]).toMatchObject({ amount: 7, completed: false });
  });

  it('başka günün ya da listede olmayan alışkanlığın işlemi görüntüyü değiştirmez', () => {
    const s = snap();
    expect(applyToSnapshot(s, { ...toggle(true), date: '2026-10-02' })).toBe(s);
    expect(applyToSnapshot(s, { ...toggle(true), habitId: 'yok' })).toBe(s);
  });

  it('şablonu olmayan eski görüntüde özet olduğu gibi kalır', () => {
    const next = applyToSnapshot(snap({ summaryTemplate: undefined }), toggle(true));
    expect(next.summaryLabel).toBe('1/3 tamamlandı');
    expect(next.doneCount).toBe(2);
  });

  it('applyAll sırayla uygular: işaretle + geri al = başlangıç', () => {
    const next = applyAll(snap(), [toggle(true), { ...toggle(false), id: 't2' }]);
    expect(next.habits[0].completed).toBe(false);
    expect(next.doneCount).toBe(1);
  });
});

describe('bekleyen kuyruk', () => {
  const a = (id: string): WidgetAction => ({ id, kind: 'inc', habitId: 'su', date: TODAY, delta: 1 });

  it('ekle / oku / uygulananları sil — arada gelen korunur', async () => {
    await appendPending(a('1'));
    await appendPending(a('2'));
    const taken = await readPending();
    await appendPending(a('3')); // boşaltma sürerken gelen dokunuş
    await removePending(taken.map((x) => x.id));
    expect((await readPending()).map((x) => x.id)).toEqual(['3']);
    await removePending(['3']);
    expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('bozuk kayıt kuyruğu çökertmez, geçersiz öğeler atlanır', async () => {
    await AsyncStorage.setItem(PENDING_KEY, '{bozuk');
    expect(await readPending()).toEqual([]);
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([a('ok'), { id: 'x', kind: 'inc' }, null, 5]));
    expect((await readPending()).map((x) => x.id)).toEqual(['ok']);
  });

  it('serialized: üst üste dokunuşlar birbirini ezmez', async () => {
    const order: string[] = [];
    await Promise.all(
      ['1', '2', '3', '4', '5'].map((id) =>
        serialized(async () => {
          const list = await readPending();
          await new Promise((r) => setTimeout(r, 1));
          await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...list, a(id)]));
          order.push(id);
        })
      )
    );
    expect(order).toEqual(['1', '2', '3', '4', '5']);
    expect((await readPending()).map((x) => x.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('serialized: bir hata zinciri kilitlemez', async () => {
    await expect(serialized(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(serialized(async () => 7)).resolves.toBe(7);
  });
});

describe('sinyal ve tarih', () => {
  it('dinleyici dokunuşta çağrılır, aboneliği bırakınca çağrılmaz; dinleyici hatası yutulur', () => {
    const fn = jest.fn();
    const off = onWidgetAction(fn);
    const offBad = onWidgetAction(() => { throw new Error('boom'); });
    emitWidgetAction();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    offBad();
    emitWidgetAction();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('localYmd yerel günü yazar', () => {
    expect(localYmd(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
