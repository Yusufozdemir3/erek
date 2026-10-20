import {
  celebrationRoute,
  congratsOutcome,
  finishedCandidates,
  finishedSettled,
  parseCelebrationData,
} from '../celebrations';
import {
  buildCongratsMessages,
  buildFinishedMessages,
  parseRequest,
} from '../../../supabase/functions/send-nudge/logic';

const ME = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

describe('parseCelebrationData', () => {
  const ok = { type: 'finished', kind: 'goal', itemId: ITEM, to: ME };

  it('geçerli yükü okur', () => {
    expect(parseCelebrationData(ok, ME)).toEqual({ type: 'finished', kind: 'goal', itemId: ITEM });
    expect(parseCelebrationData({ ...ok, type: 'congrats', kind: 'task' }, ME)).toEqual({
      type: 'congrats',
      kind: 'task',
      itemId: ITEM,
    });
  });

  it('başka hesaba, bozuk yüke ya da giriş yokken reddeder', () => {
    expect(parseCelebrationData(ok, 'someone-else')).toBeNull();
    expect(parseCelebrationData(ok, null)).toBeNull();
    expect(parseCelebrationData({ ...ok, itemId: 'nope' }, ME)).toBeNull();
    expect(parseCelebrationData({ ...ok, kind: 'tag' }, ME)).toBeNull();
    expect(parseCelebrationData({ type: 'nudge', kind: 'goal', itemId: ITEM, to: ME }, ME)).toBeNull();
    expect(parseCelebrationData(undefined, ME)).toBeNull();
  });

  it('görev için "bitti" bildirimi yoktur (yalnız tebrik olabilir)', () => {
    expect(parseCelebrationData({ ...ok, kind: 'task' }, ME)).toBeNull();
  });
});

describe('celebrationRoute', () => {
  it('"bitti" arkadaşın paylaşılan öğesini, tebrik kendi öğeni açar', () => {
    expect(celebrationRoute({ type: 'finished', kind: 'goal', itemId: ITEM })).toBe(`/shared-goal/${ITEM}`);
    expect(celebrationRoute({ type: 'finished', kind: 'habit', itemId: ITEM })).toBe(`/shared-habit/${ITEM}`);
    expect(celebrationRoute({ type: 'congrats', kind: 'goal', itemId: ITEM })).toBe(`/goal/${ITEM}`);
    expect(celebrationRoute({ type: 'congrats', kind: 'habit', itemId: ITEM })).toBe(`/habit/${ITEM}`);
    expect(celebrationRoute({ type: 'congrats', kind: 'task', itemId: ITEM })).toBeNull();
  });
});

describe('congratsOutcome / finishedSettled', () => {
  it('sunucu yanıtlarını eşler', () => {
    expect(congratsOutcome('sent')).toBe('sent');
    expect(congratsOutcome('already')).toBe('already');
    expect(congratsOutcome('rate_limited')).toBe('dailyLimit');
    expect(congratsOutcome('no_device')).toBe('noDevice');
    expect(congratsOutcome('not_finished')).toBe('notFinished');
    expect(congratsOutcome('forbidden')).toBe('failed');
    expect(congratsOutcome(undefined)).toBe('failed');
  });

  it('kimseye gidecek bir şey kalmayınca ya da reddedilince tekrar sorulmaz; ağ hatasında sorulur', () => {
    expect(finishedSettled('ok')).toBe(true);
    expect(finishedSettled('nobody')).toBe(true);
    expect(finishedSettled('forbidden')).toBe(false); // henüz yayınlanmamış eski fonksiyon da bunu döner
    expect(finishedSettled('not_finished')).toBe(false); // eşitleme henüz gelmemiş olabilir
    expect(finishedSettled(undefined)).toBe(false);
  });
});

describe('finishedCandidates', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  const today = '2026-10-19';
  const goal = (over: object) => ({
    id: 'g',
    goal_type: 'numeric' as const,
    target_value: 10 as number | null,
    current_value: 10,
    completed_at: '2026-10-19T08:00:00Z' as string | null,
    ...over,
  });

  it('yeni biten hedefi alır; bitmemiş ya da eski olanı almaz', () => {
    const list = finishedCandidates(
      [
        goal({ id: 'new' }),
        goal({ id: 'open', completed_at: null }),
        goal({ id: 'old', completed_at: '2026-09-01T08:00:00Z' }),
        goal({ id: 'short', current_value: 4 }), // tamamlandı işaretli ama hedefin altında
      ],
      [],
      today,
      now
    );
    expect(list.map((c) => c.id)).toEqual(['new']);
    expect(list[0]).toMatchObject({ kind: 'goal', key: 'goal:new:2026-10-19T08:00:00Z' });
  });

  it('kilometre taşlı hedef completed_at ile bitmiş sayılır', () => {
    const list = finishedCandidates([goal({ id: 'm', goal_type: 'milestone', target_value: null, current_value: 0 })], [], today, now);
    expect(list.map((c) => c.id)).toEqual(['m']);
  });

  it('alışkanlık bitiş tarihi geçince (bugün değil) ve yakın zamandaysa alınır', () => {
    const list = finishedCandidates(
      [],
      [
        { id: 'yesterday', end_date: '2026-10-18' },
        { id: 'today', end_date: '2026-10-19' }, // bugün hâlâ sürüyor
        { id: 'future', end_date: '2026-11-01' },
        { id: 'unbounded', end_date: null },
        { id: 'ancient', end_date: '2026-08-01' },
      ],
      today,
      now
    );
    expect(list.map((c) => c.id)).toEqual(['yesterday']);
    expect(list[0].key).toBe('habit:yesterday:2026-10-18');
  });
});

describe('Edge Function: istek ve iletiler', () => {
  it('eski istekler (action yok) hâlâ dürtmedir', () => {
    expect(parseRequest({ kind: 'habit', itemId: ITEM })).toEqual({ action: 'nudge', kind: 'habit', itemId: ITEM });
    expect(parseRequest({ kind: 'task', itemId: ITEM })).toBeNull();
  });

  it('görev yalnız tebrikte kabul edilir; "bitti" ve dürtme habit/goal ister', () => {
    expect(parseRequest({ action: 'congrats', kind: 'task', itemId: ITEM })).toEqual({
      action: 'congrats',
      kind: 'task',
      itemId: ITEM,
    });
    expect(parseRequest({ action: 'finished', kind: 'task', itemId: ITEM })).toBeNull();
    expect(parseRequest({ action: 'finished', kind: 'goal', itemId: ITEM })?.action).toBe('finished');
    expect(parseRequest({ action: 'explode', kind: 'goal', itemId: ITEM })).toBeNull();
    expect(parseRequest({ action: 'congrats', kind: 'goal', itemId: 'x' })).toBeNull();
  });

  it('"bitti" iletisi her alıcının her cihazına, kendi dilinde gider', () => {
    const msgs = buildFinishedMessages(
      {
        status: 'ok',
        sender_name: 'Ada Lovelace',
        item_title: '12 kitap',
        recipients: [
          { recipient: 'u1', tokens: [{ token: 'ExponentPushToken[a]', locale: 'tr' }] },
          { recipient: 'u2', tokens: [{ token: 'ExponentPushToken[b]', locale: 'en' }, { token: 'ExponentPushToken[c]', locale: 'de' }] },
        ],
      },
      'goal',
      ITEM
    );
    expect(msgs).toHaveLength(3);
    expect(msgs[0].title).toContain('Ada');
    expect(msgs[0].title).toContain('tamamladı');
    expect(msgs[1].title).toContain('finished');
    expect(msgs[2].title).toContain('geschafft');
    expect(msgs[0].body).toBe('12 kitap');
    expect(msgs.map((m) => m.data.to)).toEqual(['u1', 'u2', 'u2']);
    expect(msgs.every((m) => m.data.type === 'finished' && m.data.kind === 'goal' && m.data.itemId === ITEM)).toBe(true);
  });

  it('tebrik iletisi sahibine gider ve türü "congrats"', () => {
    const [m] = buildCongratsMessages(
      { status: 'ok', recipient: 'owner', sender_name: 'Can Yılmaz', item_title: 'Rapor', tokens: [{ token: 'ExponentPushToken[z]', locale: 'tr' }] },
      'task',
      ITEM
    );
    expect(m.title).toContain('Can');
    expect(m.title).toContain('tebrik');
    expect(m.data).toEqual({ type: 'congrats', kind: 'task', itemId: ITEM, to: 'owner' });
  });
});
