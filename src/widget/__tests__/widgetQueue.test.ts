// Widget kuyruğu: bekleyen dokunuşlar, sıralı yazma ve sinyal.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PENDING_KEY,
  appendPending,
  emitWidgetAction,
  localYmd,
  onWidgetAction,
  readPending,
  removePending,
  serialized,
  type WidgetAction,
} from '../widgetQueue';

const TODAY = '2026-10-03';

beforeEach(async () => {
  await AsyncStorage.clear();
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
