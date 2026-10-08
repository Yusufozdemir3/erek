import { parseNativeActions, timerOpenUri } from '@/lib/timerNotificationLogic';

describe('timerOpenUri', () => {
  it('opens the timed item', () => {
    expect(timerOpenUri('goal', 'g1')).toBe('habitapp://goal/g1');
    expect(timerOpenUri('habit', 'a b')).toBe('habitapp://habit/a%20b');
  });
});

describe('parseNativeActions', () => {
  it('keeps valid actions in order', () => {
    const json = JSON.stringify([
      { op: 'pause', at: 10, kind: 'habit', id: 'h' },
      { op: 'resume', at: 20, kind: 'goal', id: 'g' },
      { op: 'finish', at: 30, kind: '', id: '' },
    ]);
    expect(parseNativeActions(json)).toEqual([
      { op: 'pause', at: 10 },
      { op: 'resume', at: 20, kind: 'goal', id: 'g' },
      { op: 'finish', at: 30 },
    ]);
  });
  it('drops malformed entries and bad json', () => {
    expect(parseNativeActions('nope')).toEqual([]);
    expect(parseNativeActions('{}')).toEqual([]);
    expect(
      parseNativeActions(JSON.stringify([
        { op: 'resume', at: 1, kind: 'x', id: 'i' },
        { op: 'resume', at: 1, kind: 'habit', id: '' },
        { op: 'boom', at: 1 },
        { op: 'pause', at: 'now' },
        null,
      ]))
    ).toEqual([]);
  });
});
