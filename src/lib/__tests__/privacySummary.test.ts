// "Gizlilik ve çevrimdışı" sayfasının cümleleri telefonun gerçek durumundan
// türetilir. Her durum doğru cümleye gitmeli, her cümle üç dilde bulunmalı ve
// hiçbir cümle uygulamanın yapmadığı bir sözü vermemeli ("reklamsız" gibi).

import { buildSummary, NEEDS_INTERNET, WORKS_OFFLINE, type PrivacyInputs } from '../privacySummary';
import { INTERSTITIAL_MIN_GAP_MS } from '../adsLogic';
import { translations } from '@/i18n/translations';

const base: PrivacyInputs = {
  signedIn: false,
  email: null,
  mic: 'unknown',
  onlineVoiceConsent: false,
  notificationsAllowed: false,
};

const row = (i: Partial<PrivacyInputs>, id: string) => buildSummary({ ...base, ...i }).find((r) => r.id === id)!;

describe('buildSummary — veri', () => {
  it('hesapsız: veriler bu telefonda', () => {
    expect(row({}, 'data')).toMatchObject({ where: 'device', state: 'device' });
  });

  it('hesaplı: hesapta, e-postayla', () => {
    expect(row({ signedIn: true, email: 'ada@example.com' }, 'data')).toMatchObject({
      where: 'account',
      state: 'cloud',
      vars: { email: 'ada@example.com' },
    });
    expect(row({ signedIn: true, email: null }, 'data').state).toBe('cloudNoEmail');
  });
});

describe('buildSummary — sesli giriş', () => {
  it('izin yok / bilinmiyor / kalıcı ret', () => {
    expect(row({ mic: 'unknown' }, 'voice')).toMatchObject({ where: 'device', state: 'off' });
    expect(row({ mic: 'ask' }, 'voice').state).toBe('off');
    expect(row({ mic: 'blocked' }, 'voice').state).toBe('blocked');
  });

  it('izin var + onay yok: ses telefondan çıkmaz', () => {
    expect(row({ mic: 'granted' }, 'voice')).toMatchObject({ where: 'device', state: 'device' });
  });

  it('izin var + çevrim içi onay: hizmet sağlayıcıya gider', () => {
    expect(row({ mic: 'granted', onlineVoiceConsent: true }, 'voice')).toMatchObject({ where: 'thirdParty', state: 'online' });
  });

  it('onay verilmiş ama mikrofon kapalıysa "çevrim içi" denmez', () => {
    expect(row({ mic: 'blocked', onlineVoiceConsent: true }, 'voice').state).toBe('blocked');
  });
});

describe('buildSummary — bildirimler', () => {
  it('izin yok / yerel / arkadaş hatırlatmaları', () => {
    expect(row({ notificationsAllowed: false }, 'notifications').state).toBe('off');
    expect(row({ notificationsAllowed: true }, 'notifications')).toMatchObject({ where: 'device', state: 'local' });
    expect(row({ notificationsAllowed: true, signedIn: true }, 'notifications')).toMatchObject({
      where: 'account',
      state: 'friends',
    });
  });
});

describe('buildSummary — reklam ve çökme', () => {
  it('her durumda listelenir; reklam sıklığı koddaki gerçek sabitten gelir', () => {
    for (const signedIn of [false, true]) {
      const rows = buildSummary({ ...base, signedIn });
      expect(rows.find((r) => r.id === 'ads')).toMatchObject({
        where: 'thirdParty',
        vars: { minutes: INTERSTITIAL_MIN_GAP_MS / 60_000 },
      });
      expect(rows.find((r) => r.id === 'crash')?.where).toBe('thirdParty');
    }
    expect(INTERSTITIAL_MIN_GAP_MS / 60_000).toBe(30);
  });

  it('sıra sabit: veri, ses, bildirim, reklam, çökme', () => {
    expect(buildSummary(base).map((r) => r.id)).toEqual(['data', 'voice', 'notifications', 'ads', 'crash']);
  });
});

describe('metinler', () => {
  const allStates: Record<string, string[]> = {
    data: ['device', 'cloud', 'cloudNoEmail'],
    voice: ['off', 'blocked', 'device', 'online'],
    notifications: ['off', 'local', 'friends'],
    ads: ['ads'],
    crash: ['crash'],
  };

  it('her durumun cümlesi ve başlığı üç dilde var', () => {
    for (const lang of ['tr', 'en', 'de'] as const) {
      const d = translations[lang];
      for (const [id, states] of Object.entries(allStates)) {
        expect(d[`privacy.row.${id}.title`]).toBeTruthy();
        for (const s of states) expect(d[`privacy.row.${id}.${s}`]).toBeTruthy();
      }
      for (const k of WORKS_OFFLINE) expect(d[`privacy.offline.${k}`]).toBeTruthy();
      for (const k of NEEDS_INTERNET) expect(d[`privacy.online.${k}`]).toBeTruthy();
    }
  });

  it('reklam cümlesi gerçek dakikayı yer tutucuyla alır (sabit sayı yazılmaz)', () => {
    for (const lang of ['tr', 'en', 'de'] as const) {
      expect(translations[lang]['privacy.row.ads.ads']).toContain('{minutes}');
    }
  });

  it('sayfa hiçbir dilde "reklamsız" sözü vermez', () => {
    const banned = [/reklamsız/i, /reklam yok/i, /ad-free/i, /no ads/i, /werbefrei/i, /keine werbung/i];
    for (const lang of ['tr', 'en', 'de'] as const) {
      const page = Object.entries(translations[lang])
        .filter(([k]) => k.startsWith('privacy.') || k === 'profile.privacy')
        .map(([, v]) => v)
        .join(' ');
      for (const b of banned) expect(page).not.toMatch(b);
    }
  });
});
