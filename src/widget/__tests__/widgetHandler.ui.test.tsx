// Widget'ların görünümü (hangi satır neye dokunur) ve arka plan işleyicisinin
// dokunuşu kuyruğa + anlık görüntüye yazması.

import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodayWidget } from '../TodayWidget';
import { CounterWidget } from '../CounterWidget';
import { TasksWidget } from '../TasksWidget';
import { widgetTaskHandler } from '../widgetTaskHandler';
import { FALLBACK_COLORS, readSnapshot, writeSnapshot, type WidgetSnapshot } from '../widgetSnapshot';
import { INC_ACTION, TASK_ACTION, TOGGLE_ACTION, localYmd, onWidgetAction, readPending } from '../widgetQueue';

const mockRequestUpdate = jest.fn(async (_: unknown) => {});
jest.mock('react-native-android-widget', () => ({
  FlexWidget: 'FlexWidget',
  TextWidget: 'TextWidget',
  requestWidgetUpdate: (o: unknown) => mockRequestUpdate(o),
}));

const today = localYmd();

function snap(over: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    date: today,
    dateLabel: '',
    title: 'Bugün',
    summaryLabel: '0/3 tamamlandı',
    summaryTemplate: '{done}/{total} tamamlandı',
    emptyLabel: 'Bugüne planlı alışkanlık yok',
    staleLabel: 'Yeni gün — güncellemek için dokun',
    counterTitle: 'Sayaçlar',
    counterEmptyLabel: 'Bugün sayılacak alışkanlık yok',
    doneCount: 0,
    totalCount: 3,
    colors: FALLBACK_COLORS,
    tasks: [
      { id: 'market', title: 'Market', color: '#f59e0b', completed: false },
      { id: 'mail', title: 'Mail', color: '#10b981', completed: true },
    ],
    tasksTitle: 'Görevler',
    tasksEmptyLabel: 'Bugün bekleyen görev yok',
    habits: [
      { id: 'kitap', title: 'Kitap oku', color: '#111111', completed: false, kind: 'binary' },
      { id: 'su', title: 'Su iç', color: '#222222', completed: false, kind: 'numeric', amount: 6, target: 8, unit: 'bardak' },
      { id: 'yoga', title: 'Yoga', color: '#333333', completed: false, kind: 'timer' },
    ],
    ...over,
  };
}

// The widget components return plain element trees (the library's components
// are mocked as host strings), so they can be walked without rendering.
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
const clicks = (root: El) =>
  walk(root)
    .filter((e) => e.props.clickAction)
    .map((e) => [e.props.clickAction, e.props.clickActionData?.habitId ?? null]);

describe('TodayWidget', () => {
  it('ikili satır işaretler, sayılı satır +1 ekler, zamanlayıcı ve kartın kendisi uygulamayı açar', () => {
    const root = TodayWidget({ snapshot: snap() }) as El;
    expect(clicks(root)).toEqual([
      ['OPEN_APP', null],
      [TOGGLE_ACTION, 'kitap'],
      [INC_ACTION, 'su'],
      ['OPEN_APP', null],
    ]);
    expect(texts(root)).toContain('6/8 ＋');
  });

  it('dünkü görüntü: satır yok, "güncellemek için dokun" yazar, yalnız kart dokunulur', () => {
    const root = TodayWidget({ snapshot: snap({ date: '2000-01-01' }) }) as El;
    expect(clicks(root)).toEqual([['OPEN_APP', null]]);
    expect(texts(root)).toContain('Yeni gün — güncellemek için dokun');
    expect(texts(root)).not.toContain('Kitap oku');
  });

  it('görüntü yokken (uygulama hiç açılmadı) çökmez', () => {
    const root = TodayWidget({ snapshot: null }) as El;
    expect(clicks(root)).toEqual([['OPEN_APP', null]]);
  });
});

describe('CounterWidget', () => {
  it('yalnız sayılı alışkanlıklar, her birinde +1 düğmesi ve birimli miktar', () => {
    const root = CounterWidget({ snapshot: snap() }) as El;
    expect(clicks(root)).toEqual([
      ['OPEN_APP', null],
      [INC_ACTION, 'su'],
    ]);
    expect(texts(root)).toEqual(expect.arrayContaining(['Sayaçlar', 'Su iç', '6/8 bardak', '+1']));
    expect(texts(root)).not.toContain('Kitap oku');
  });

  it('sayılı alışkanlık yoksa açıklama gösterir', () => {
    const root = CounterWidget({ snapshot: snap({ habits: [] }) }) as El;
    expect(texts(root)).toContain('Bugün sayılacak alışkanlık yok');
  });
});

describe('TasksWidget', () => {
  it('her satır görevi işaretler/açar; kartın kendisi uygulamayı açar; sayaç "biten/toplam"', () => {
    const root = TasksWidget({ snapshot: snap() }) as El;
    expect(clicks(root)).toEqual([
      ['OPEN_APP', null],
      [TASK_ACTION, null],
      [TASK_ACTION, null],
    ]);
    expect(
      walk(root)
        .filter((e) => e.props.clickAction === TASK_ACTION)
        .map((e) => e.props.clickActionData.taskId)
    ).toEqual(['market', 'mail']);
    expect(texts(root)).toEqual(expect.arrayContaining(['Görevler', '1/2', 'Market', 'Mail', '○', '✓']));
  });

  it('görev yoksa açıklama; dünkü görüntüde satır yok', () => {
    expect(texts(TasksWidget({ snapshot: snap({ tasks: [] }) }) as El)).toContain('Bugün bekleyen görev yok');
    const stale = TasksWidget({ snapshot: snap({ date: '2000-01-01' }) }) as El;
    expect(clicks(stale)).toEqual([['OPEN_APP', null]]);
    expect(texts(stale)).toContain('Yeni gün — güncellemek için dokun');
  });
});

describe('widgetTaskHandler', () => {
  const info = (widgetName: string) => ({ widgetName, widgetId: 1, width: 300, height: 200, screenInfo: {} as any });

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockRequestUpdate.mockClear();
  });

  it('dokunuş: kuyruğa girer, görüntü anında güncellenir, diğer widget da tazelenir, uygulamaya haber verilir', async () => {
    await writeSnapshot(snap());
    const render = jest.fn();
    const ping = jest.fn();
    const off = onWidgetAction(ping);

    await widgetTaskHandler({
      widgetInfo: info('ErekToday'),
      widgetAction: 'WIDGET_CLICK',
      clickAction: TOGGLE_ACTION,
      clickActionData: { habitId: 'kitap' },
      renderWidget: render,
    });
    off();

    expect(await readPending()).toEqual([
      expect.objectContaining({ kind: 'toggle', habitId: 'kitap', date: today, completed: true }),
    ]);
    const stored = await readSnapshot();
    expect(stored?.habits[0].completed).toBe(true);
    expect(stored?.summaryLabel).toBe('1/3 tamamlandı');
    expect(render).toHaveBeenCalledTimes(1);
    expect((render.mock.calls[0][0] as El).props.snapshot.habits[0].completed).toBe(true);
    expect(mockRequestUpdate).toHaveBeenCalledWith(expect.objectContaining({ widgetName: 'ErekCounter' }));
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('sayaçtan +1: miktar artar, Bugün widget’ı tazelenir', async () => {
    await writeSnapshot(snap());
    const render = jest.fn();
    await widgetTaskHandler({
      widgetInfo: info('ErekCounter'),
      widgetAction: 'WIDGET_CLICK',
      clickAction: INC_ACTION,
      clickActionData: { habitId: 'su' },
      renderWidget: render,
    });
    expect((await readSnapshot())?.habits[1].amount).toBe(7);
    expect((render.mock.calls[0][0] as El).type).toBe(CounterWidget);
    expect(mockRequestUpdate).toHaveBeenCalledWith(expect.objectContaining({ widgetName: 'ErekToday' }));
  });

  it('art arda iki dokunuş: ikisi de sayılır, işaretle+geri al doğru sonuçlanır', async () => {
    await writeSnapshot(snap());
    const tap = (clickAction: string, habitId: string) =>
      widgetTaskHandler({
        widgetInfo: info('ErekToday'),
        widgetAction: 'WIDGET_CLICK',
        clickAction,
        clickActionData: { habitId },
        renderWidget: jest.fn(),
      });
    await Promise.all([tap(INC_ACTION, 'su'), tap(INC_ACTION, 'su'), tap(TOGGLE_ACTION, 'kitap'), tap(TOGGLE_ACTION, 'kitap')]);
    const s = await readSnapshot();
    expect(s?.habits[1]).toMatchObject({ amount: 8, completed: true });
    expect(s?.habits[0].completed).toBe(false);
    expect((await readPending()).map((a) => (a.kind === 'inc' ? a.delta : a.completed))).toEqual([1, 1, true, false]);
  });

  it('dünkü görüntüye dokunuş kuyruğa girmez', async () => {
    await writeSnapshot(snap({ date: '2000-01-01' }));
    const render = jest.fn();
    await widgetTaskHandler({
      widgetInfo: info('ErekToday'),
      widgetAction: 'WIDGET_CLICK',
      clickAction: TOGGLE_ACTION,
      clickActionData: { habitId: 'kitap' },
      renderWidget: render,
    });
    expect(await readPending()).toEqual([]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('görev dokunuşu: kuyruğa girer, görüntü güncellenir, diğer İKİ widget da tazelenir', async () => {
    await writeSnapshot(snap());
    const render = jest.fn();
    await widgetTaskHandler({
      widgetInfo: info('ErekTasks'),
      widgetAction: 'WIDGET_CLICK',
      clickAction: TASK_ACTION,
      clickActionData: { taskId: 'market' },
      renderWidget: render,
    });
    expect(await readPending()).toEqual([expect.objectContaining({ kind: 'task', taskId: 'market', completed: true })]);
    expect((await readSnapshot())?.tasks?.map((t) => [t.id, t.completed])).toEqual([['market', true], ['mail', true]]);
    expect((render.mock.calls[0][0] as El).type).toBe(TasksWidget);
    const refreshed = mockRequestUpdate.mock.calls.map((c) => (c[0] as { widgetName: string }).widgetName).sort();
    expect(refreshed).toEqual(['ErekCounter', 'ErekToday']);
  });

  it('ekleme/güncelleme olayında doğru widget çizilir', async () => {
    await writeSnapshot(snap());
    const render = jest.fn();
    await widgetTaskHandler({ widgetInfo: info('ErekCounter'), widgetAction: 'WIDGET_ADDED', renderWidget: render });
    await widgetTaskHandler({ widgetInfo: info('ErekToday'), widgetAction: 'WIDGET_UPDATE', renderWidget: render });
    expect(render.mock.calls.map((c) => (c[0] as El).type)).toEqual([CounterWidget, TodayWidget]);
  });
});
