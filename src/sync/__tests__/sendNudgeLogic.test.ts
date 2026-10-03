// send-nudge Edge Function'ının saf kısmı (Deno'ya bağlı olmayan dosya,
// supabase/functions/send-nudge/logic.ts). Başlık KİM hatırlattığını, gövde NEYİ
// (alışkanlık/hedef adı) söyler; kilit ekranında gizlemeyi Android kanalı
// (lockscreenVisibility PRIVATE) yapar, bkz. notifications.ts.

import {
  buildMessages,
  deadTokens,
  firstName,
  NUDGE_CHANNEL_ID,
  outcome,
  parseRequest,
  pickServiceKey,
  type ExpoTicket,
  type PreparedNudge,
} from '../../../supabase/functions/send-nudge/logic';
import { NUDGE_CHANNEL_ID as APP_CHANNEL_ID } from '@/lib/nudgePayload';

const ITEM = '22222222-2222-4222-8222-222222222222';
const OWNER = '11111111-1111-4111-8111-111111111111';
const prep: PreparedNudge = {
  status: 'ok',
  recipient: OWNER,
  sender_name: 'Bora Yılmaz',
  item_title: 'Sabah koşusu',
  tokens: [
    { token: 'ExponentPushToken[tr]', locale: 'tr' },
    { token: 'ExponentPushToken[en]', locale: 'en' },
    { token: 'ExponentPushToken[de]', locale: 'de' },
  ],
};

describe('parseRequest', () => {
  it('yalnız habit/goal ve geçerli UUID kabul eder', () => {
    expect(parseRequest({ kind: 'habit', itemId: ITEM })).toEqual({ kind: 'habit', itemId: ITEM });
    expect(parseRequest({ kind: 'goal', itemId: ITEM })).toEqual({ kind: 'goal', itemId: ITEM });
    expect(parseRequest({ kind: 'task', itemId: ITEM })).toBeNull();
    expect(parseRequest({ kind: 'habit', itemId: "x' or 1=1" })).toBeNull();
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest('habit')).toBeNull();
  });
});

describe('buildMessages', () => {
  const msgs = buildMessages(prep, 'habit', ITEM);

  it('her cihaza kendi dilinde, ilk adla başlık; gövde öğenin adı', () => {
    expect(msgs.map((m) => m.title)).toEqual([
      'Bora sana bir hatırlatma gönderdi',
      'Bora sent you a reminder',
      'Bora hat dir eine Erinnerung geschickt',
    ]);
    expect(msgs.every((m) => m.body === 'Sabah koşusu')).toBe(true);
  });

  it('öğe adındaki boşluklar toplanır, "s" gibi harfler bozulmaz, uzunluk sınırlanır', () => {
    const messy = { ...prep, item_title: '  Sessiz   sabah\n sosyal  ' };
    expect(buildMessages(messy, 'habit', ITEM)[0].body).toBe('Sessiz sabah sosyal');
    const long = { ...prep, item_title: 'x'.repeat(500) };
    expect(buildMessages(long, 'habit', ITEM)[0].body).toHaveLength(120);
  });

  it('öğe adı yoksa gövde uygulama adıdır (boş bildirim olmaz)', () => {
    expect(buildMessages({ ...prep, item_title: null }, 'habit', ITEM)[0].body).toBe('Erek');
    expect(buildMessages({ ...prep, item_title: '   ' }, 'habit', ITEM)[0].body).toBe('Erek');
  });

  it('veri yalnız tür, kimlik ve alıcıyı taşır (ad yalnız görünen metinde)', () => {
    expect(msgs[0].data).toEqual({ type: 'nudge', kind: 'habit', itemId: ITEM, to: OWNER });
    expect(JSON.stringify(msgs[0].data)).not.toContain('Sabah');
  });

  it('uygulamanın oluşturduğu kanala gider; 12 saatte bayatlar', () => {
    expect(NUDGE_CHANNEL_ID).toBe(APP_CHANNEL_ID);
    expect(msgs.every((m) => m.channelId === APP_CHANNEL_ID && m.ttl === 12 * 3600)).toBe(true);
  });

  it('adı olmayan gönderen için nötr ifade', () => {
    const [tr] = buildMessages({ ...prep, sender_name: null }, 'goal', ITEM);
    expect(tr.title).toBe('Bir arkadaşın sana bir hatırlatma gönderdi');
  });
});

describe('firstName', () => {
  it('ilk kelimeyi alır, boşlukları ve aşırı uzunluğu temizler', () => {
    expect(firstName('  Ada   Lovelace ')).toBe('Ada');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName('x'.repeat(100))).toHaveLength(40);
  });
});

describe('pickServiceKey', () => {
  it('eski (legacy) anahtar varsa onu kullanır', () => {
    expect(pickServiceKey('eyJlegacy', '{"default":"sb_secret_new"}')).toBe('eyJlegacy');
  });

  it('eski anahtarlar kapatılmışsa yenilerin "default"unu alır', () => {
    expect(pickServiceKey(undefined, '{"default":"sb_secret_new","internal":"sb_secret_x"}')).toBe('sb_secret_new');
  });

  it('hiçbiri yoksa ya da bozuksa null', () => {
    expect(pickServiceKey(undefined, undefined)).toBeNull();
    expect(pickServiceKey('', 'not json')).toBeNull();
    expect(pickServiceKey(undefined, '{"internal":"sb_secret_x"}')).toBeNull();
  });
});

describe('deadTokens / outcome', () => {
  const msgs = buildMessages(prep, 'habit', ITEM);
  const ok: ExpoTicket = { status: 'ok' };
  const gone: ExpoTicket = { status: 'error', details: { error: 'DeviceNotRegistered' } };
  const other: ExpoTicket = { status: 'error', details: { error: 'MessageRateExceeded' } };

  it('artık var olmayan cihazların anahtarlarını ayıklar', () => {
    expect(deadTokens(msgs, [ok, gone, other])).toEqual(['ExponentPushToken[en]']);
  });

  it('en az bir cihaza ulaştıysa gönderildi', () => {
    expect(outcome(msgs, [gone, ok, other])).toBe('sent');
  });

  it('hiçbir cihaz kalmadıysa no_device (yedek: mesajla hatırlat)', () => {
    expect(outcome(msgs, [gone, gone, gone])).toBe('no_device');
  });

  it('başka hatalar ya da boş yanıt hata sayılır', () => {
    expect(outcome(msgs, [other, gone, other])).toBe('error');
    expect(outcome(msgs, [])).toBe('error');
  });
});
