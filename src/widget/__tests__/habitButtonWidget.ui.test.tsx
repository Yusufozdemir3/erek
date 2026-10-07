// Tek alışkanlık düğme widget'ları: Evet/Hayır (dokununca tamamlanır) ve Sayaç
// (her dokunuşta +1); alışkanlık widget'a özel seçilir ve kaydedilir.

import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HabitButtonWidget } from '../HabitButtonWidget';
import { widgetTaskHandler } from '../widgetTaskHandler';
import {
  FALLBACK_COLORS,
  HABIT_CHECK_WIDGET_NAME,
  HABIT_COUNT_WIDGET_NAME,
  readPicks,
  readSnapshot,
  setPick,
  writeSnapshot,
  type WidgetSnapshot,
} from '../widgetSnapshot';
import { INC_ACTION, TOGGLE_ACTION, localYmd, readPending } from '../widgetQueue';

const mockDraw = jest.fn();
jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  ListWidget: 'ListWidget',
  TextWidget: 'TextWidget',
  requestWidgetUpdate: async () => {},
}));

type El = React.ReactElement<any>;
function walk(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (React.isValidElement(node)) {
    out.push(node as El);
    walk((node as El).props.children, out);
  }
  return out;
}
const texts = (root: El) => walk(root).filter((e) => e.type === 'TextWidget').map((e) => e.props.text);
const root = (e: unknown) => e as El;
// widgetFor returns the component element itself; call it to get its tree.
const drawn = (e: unknown): El => {
  const el = e as El;
  return typeof el.type === 'function' ? ((el.type as (p: unknown) => El)(el.props)) : el;
};

const today = localYmd();

function snap(over: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    date: today,
    dateLabel: '',
    title: 'Bugün',
    summaryLabel: '',
    summaryTemplate: '{done}/{total}',
    emptyLabel: '',
    staleLabel: 'Yeni gün — güncellemek için dokun',
    pickLabel: 'Alışkanlık seç — dokun',
    notTodayLabel: 'Bugün planlı değil',
    doneCount: 0,
    totalCount: 2,
    colors: FALLBACK_COLORS,
    pickable: [
      { id: 'kitap', title: 'Kitap oku', color: '#111111', kind: 'binary' },
      { id: 'su', title: 'Su iç', color: '#222222', kind: 'numeric' },
      { id: 'yuru', title: 'Yürü', color: '#333333', kind: 'binary' },
    ],
    habits: [
      { id: 'kitap', title: 'Kitap oku', color: '#111111', completed: false, kind: 'binary' },
      { id: 'su', title: 'Su iç', color: '#222222', completed: false, kind: 'numeric', amount: 6, target: 8, unit: 'bardak' },
    ],
    ...over,
  };
}

describe('HabitButtonWidget', () => {
  it('Evet/Hayır: tamamlanmamış ○, dokununca TOGGLE; tamamlanınca ✓', () => {
    const open = root(HabitButtonWidget({ snapshot: snap(), habitId: 'kitap', kind: 'binary' }));
    expect(texts(open)).toEqual(['○', 'Kitap oku']);
    expect(open.props.clickAction).toBe(TOGGLE_ACTION);
    expect(open.props.clickActionData).toEqual({ habitId: 'kitap' });

    const done = snap({ habits: [{ id: 'kitap', title: 'Kitap oku', color: '#111111', completed: true, kind: 'binary' }] });
    expect(texts(root(HabitButtonWidget({ snapshot: done, habitId: 'kitap', kind: 'binary' })))).toEqual(['✓', 'Kitap oku']);
  });

  it('Sayaç: miktar/hedef ve ＋, dokununca INC', () => {
    const el = root(HabitButtonWidget({ snapshot: snap(), habitId: 'su', kind: 'numeric' }));
    expect(texts(el)).toEqual(['6/8 ＋', 'Su iç']);
    expect(el.props.clickAction).toBe(INC_ACTION);
    expect(el.props.clickActionData).toEqual({ habitId: 'su' });
  });

  it('seçim yoksa ya da tür uymuyorsa uygulamayı açan "seç" kartı', () => {
    const none = root(HabitButtonWidget({ snapshot: snap(), habitId: null, kind: 'binary' }));
    expect(none.props.clickAction).toBe('OPEN_APP');
    expect(texts(none)).toEqual(['Alışkanlık seç — dokun']);
    // sayaç widget'ına ikili alışkanlık atanmış → düğme çizilmez
    const wrong = root(HabitButtonWidget({ snapshot: snap(), habitId: 'kitap', kind: 'numeric' }));
    expect(wrong.props.clickAction).toBe('OPEN_APP');
  });

  it('bugün planlı olmayan alışkanlık: adı ve uyarı, düğme yok; dünkü görüntü: yenile', () => {
    const el = root(HabitButtonWidget({ snapshot: snap(), habitId: 'yuru', kind: 'binary' }));
    expect(el.props.clickAction).toBe('OPEN_APP');
    expect(texts(el)).toEqual(['Yürü', 'Bugün planlı değil']);
    const stale = root(HabitButtonWidget({ snapshot: snap({ date: '2000-01-01' }), habitId: 'kitap', kind: 'binary' }));
    expect(texts(stale)).toContain('Yeni gün — güncellemek için dokun');
    expect(stale.props.clickAction).toBe('OPEN_APP');
  });
});

describe('widget başına seçim', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockDraw.mockClear();
  });

  it('kaydedilir, widget silinince temizlenir', async () => {
    await setPick(7, 'kitap');
    await setPick(8, 'su');
    expect(await readPicks()).toEqual({ '7': 'kitap', '8': 'su' });
    await widgetTaskHandler({
      widgetAction: 'WIDGET_DELETED',
      widgetInfo: { widgetName: HABIT_CHECK_WIDGET_NAME, widgetId: 7, width: 100, height: 50 },
      renderWidget: mockDraw,
    } as never);
    expect(await readPicks()).toEqual({ '8': 'su' });
  });

  it('dokunuş seçilen widget için kuyruğa +1 yazar ve widget yeniden çizilir', async () => {
    await writeSnapshot(snap());
    await setPick(8, 'su');
    await widgetTaskHandler({
      widgetAction: 'WIDGET_CLICK',
      clickAction: INC_ACTION,
      clickActionData: { habitId: 'su' },
      widgetInfo: { widgetName: HABIT_COUNT_WIDGET_NAME, widgetId: 8, width: 100, height: 50 },
      renderWidget: mockDraw,
    } as never);
    const pending = await readPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: 'inc', habitId: 'su', delta: 1 });
    expect((await readSnapshot())!.habits.find((h) => h.id === 'su')!.amount).toBe(7);
    expect(texts(drawn(mockDraw.mock.calls[0][0]))).toEqual(['7/8 ＋', 'Su iç']);
  });

  it('Evet/Hayır dokunuşu tamamlar; ikinci dokunuş geri alır', async () => {
    await writeSnapshot(snap());
    await setPick(7, 'kitap');
    const tap = () =>
      widgetTaskHandler({
        widgetAction: 'WIDGET_CLICK',
        clickAction: TOGGLE_ACTION,
        clickActionData: { habitId: 'kitap' },
        widgetInfo: { widgetName: HABIT_CHECK_WIDGET_NAME, widgetId: 7, width: 100, height: 50 },
        renderWidget: mockDraw,
      } as never);
    await tap();
    expect(texts(drawn(mockDraw.mock.calls[0][0]))).toEqual(['✓', 'Kitap oku']);
    await tap();
    expect(texts(drawn(mockDraw.mock.calls[1][0]))).toEqual(['○', 'Kitap oku']);
  });
});
