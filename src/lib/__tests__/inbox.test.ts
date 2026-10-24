// Bildirimler kutusu, saf kısımlar: satır ayrıştırma, okunmamış sayısı, rota.

import { inboxRoute, newestAt, parseInbox, unreadCount, type InboxItem } from '../inbox';

const ID = '11111111-1111-4111-8111-111111111111';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'a',
  type: 'congrats',
  item_kind: 'goal',
  item_id: ID,
  sender_id: 'u1',
  sender_name: 'Ali',
  item_title: '100 km',
  created_at: '2026-10-24T10:00:00Z',
  ...over,
});

const item = (over: Partial<InboxItem> = {}): InboxItem => ({
  ...parseInbox([row()])[0],
  ...over,
});

describe('parseInbox', () => {
  it('geçerli satırları çevirir', () => {
    expect(parseInbox([row()])).toEqual([
      {
        id: 'a',
        type: 'congrats',
        kind: 'goal',
        itemId: ID,
        senderId: 'u1',
        senderName: 'Ali',
        itemTitle: '100 km',
        createdAt: '2026-10-24T10:00:00Z',
      },
    ]);
  });

  it('bozuk satırları atar, eksik ad ve başlık null olur', () => {
    const out = parseInbox([
      row({ type: 'spam' }),
      row({ item_kind: 'note' }),
      row({ id: 5 }),
      null,
      row({ id: 'b', sender_name: null, item_title: null }),
    ]);
    expect(out.map((i) => i.id)).toEqual(['b']);
    expect(out[0].senderName).toBeNull();
    expect(out[0].itemTitle).toBeNull();
  });

  it('dizi değilse boş', () => {
    expect(parseInbox(null)).toEqual([]);
    expect(parseInbox({})).toEqual([]);
  });
});

describe('unreadCount / newestAt', () => {
  const items = [
    item({ id: '1', createdAt: '2026-10-24T10:00:00Z' }),
    item({ id: '2', createdAt: '2026-10-23T10:00:00Z' }),
  ];

  it('hiç açılmadıysa hepsi okunmamış', () => {
    expect(unreadCount(items, null)).toBe(2);
  });

  it('görülen andan sonrakiler okunmamış', () => {
    expect(unreadCount(items, '2026-10-23T12:00:00Z')).toBe(1);
    expect(unreadCount(items, '2026-10-24T10:00:00Z')).toBe(0);
  });

  it('en yeni satırın zamanı', () => {
    expect(newestAt(items)).toBe('2026-10-24T10:00:00Z');
    expect(newestAt([])).toBeNull();
  });
});

describe('inboxRoute', () => {
  it('tebrik ve hatırlatma benim öğemi açar', () => {
    expect(inboxRoute(item())).toBe(`/goal/${ID}`);
    expect(inboxRoute(item({ type: 'nudge', kind: 'habit' }))).toBe(`/habit/${ID}`);
  });

  it('"bitirdi" haberi arkadaşın paylaşılan öğesini açar', () => {
    expect(inboxRoute(item({ type: 'finished' }))).toBe(`/shared-goal/${ID}`);
  });

  it('görev ve silinmiş öğe bir yer açmaz', () => {
    expect(inboxRoute(item({ kind: 'task' }))).toBeNull();
    expect(inboxRoute(item({ itemTitle: null }))).toBeNull();
  });
});
