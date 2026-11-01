// Yerel widget'ların saf yardımcıları: ikon glifi, ileriki günler, bekleyen
// dokunuşların panoya eklenmesi, yerel kuyruğun ayrıştırılması, eski seçimlerin taşınması.

import {
  addDaysYmd,
  dueDays,
  iconSpec,
  overlayPending,
  parseNativeWidgetActions,
  picksToImport,
  type NativeBoardHabit,
} from '../nativeWidgetsLogic';

const glyphs: { feather: Record<string, number>; ionicons: Record<string, number> } = {
  feather: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json'),
  ionicons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'),
};
const SET: Record<string, { family: 'feather' | 'ionicons'; name: string }> = {
  water: { family: 'ionicons', name: 'water-outline' },
  book: { family: 'feather', name: 'book-open' },
  broken: { family: 'feather', name: 'no-such-glyph' },
};
const resolve = (id: string) => SET[id];

describe('iconSpec', () => {
  it('bilinen ikon: yazı tipindeki kod noktası', () => {
    expect(iconSpec('water', resolve, glyphs)).toEqual({ f: 'ionicons', c: glyphs.ionicons['water-outline'] });
    expect(iconSpec('book', resolve, glyphs)).toEqual({ f: 'feather', c: glyphs.feather['book-open'] });
  });

  it('eski emoji metin olarak gider; ikon yoksa null', () => {
    expect(iconSpec('💧', resolve, glyphs)).toEqual({ e: '💧' });
    expect(iconSpec(null, resolve, glyphs)).toBeNull();
    expect(iconSpec('', resolve, glyphs)).toBeNull();
  });

  it('yazı tipinde olmayan glif: ikonsuz', () => {
    expect(iconSpec('broken', resolve, glyphs)).toBeNull();
  });
});

describe('addDaysYmd / dueDays', () => {
  it('ay ve yıl sınırını geçer', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysYmd('2026-10-25', 0)).toBe('2026-10-25');
  });

  it('bugünden başlayarak planlı günleri listeler', () => {
    const days = dueDays('2026-10-25', (d) => d.endsWith('5') || d.endsWith('7'), 8);
    expect(days).toEqual(['2026-10-25', '2026-10-27']);
    expect(dueDays('2026-10-25', () => true)).toHaveLength(8);
  });
});

const habit = (over: Partial<NativeBoardHabit>): NativeBoardHabit => ({
  id: 'h',
  title: 'H',
  color: '#000000',
  kind: 'binary',
  icon: null,
  target: null,
  amount: 0,
  completed: false,
  due: ['2026-10-25'],
  ...over,
});

describe('overlayPending', () => {
  const day = '2026-10-25';

  it('işaretleme ve +1 uygulanır, hedefe ulaşan tamamlanır', () => {
    const list = [habit({ id: 'a' }), habit({ id: 'b', kind: 'numeric', target: 2, amount: 1 })];
    const out = overlayPending(list, day, [
      { id: '1', kind: 'toggle', habitId: 'a', date: day, completed: true },
      { id: '2', kind: 'inc', habitId: 'b', date: day, delta: 1 },
    ]);
    expect(out[0].completed).toBe(true);
    expect(out[1]).toMatchObject({ amount: 2, completed: true });
  });

  it('başka günün, görevin ve yanlış türün dokunuşu yok sayılır', () => {
    const list = [habit({ id: 'a' }), habit({ id: 'b', kind: 'numeric', target: 3 })];
    const out = overlayPending(list, day, [
      { id: '1', kind: 'toggle', habitId: 'a', date: '2026-10-24', completed: true },
      { id: '2', kind: 'task', taskId: 'a', date: day, completed: true },
      { id: '3', kind: 'toggle', habitId: 'b', date: day, completed: true },
      { id: '4', kind: 'inc', habitId: 'a', date: day, delta: 1 },
    ]);
    expect(out).toEqual(list);
  });

  it('eksiye düşmez', () => {
    const out = overlayPending([habit({ kind: 'numeric', amount: 0 })], day, [
      { id: '1', kind: 'inc', habitId: 'h', date: day, delta: -1 },
    ]);
    expect(out[0].amount).toBe(0);
  });
});

describe('parseNativeWidgetActions', () => {
  it('geçerli kayıtlar sırayla, bozuklar atılır', () => {
    const json = JSON.stringify([
      { id: 'n1', kind: 'toggle', habitId: 'a', date: '2026-10-25', completed: true, at: 1 },
      { id: 'n2', kind: 'inc', habitId: 'b', date: '2026-10-25', delta: 1 },
      { id: 'n3', kind: 'inc', habitId: 'b', date: '2026-10-25', delta: 'x' },
      { id: 'n4', kind: 'toggle', habitId: 'a', date: 'dün', completed: true },
      { kind: 'toggle', habitId: 'a', date: '2026-10-25', completed: true },
      null,
      'çöp',
    ]);
    expect(parseNativeWidgetActions(json)).toEqual([
      { id: 'n1', kind: 'toggle', habitId: 'a', date: '2026-10-25', completed: true },
      { id: 'n2', kind: 'inc', habitId: 'b', date: '2026-10-25', delta: 1 },
    ]);
  });

  it('JSON değilse ya da dizi değilse boş', () => {
    expect(parseNativeWidgetActions('{')).toEqual([]);
    expect(parseNativeWidgetActions('{}')).toEqual([]);
  });
});

describe('picksToImport', () => {
  it('yalnız sayısal widget kimlikleri ve dolu alışkanlık kimlikleri', () => {
    expect(picksToImport(JSON.stringify({ '7': 'kitap', x: 'su', '8': '', '9': 3 }))).toBe(JSON.stringify({ '7': 'kitap' }));
  });

  it('taşınacak bir şey yoksa null', () => {
    expect(picksToImport(null)).toBeNull();
    expect(picksToImport('{}')).toBeNull();
    expect(picksToImport('[1]')).toBeNull();
    expect(picksToImport('bozuk')).toBeNull();
  });
});
