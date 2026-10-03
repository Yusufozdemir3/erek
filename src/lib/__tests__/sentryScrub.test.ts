// Çökme raporu: gizlilik politikasındaki "içerik yok" sözünü kodla tutar.

import { MAX_MESSAGE_LEN, scrubBreadcrumb, scrubEvent } from '../sentryScrub';

describe('scrubBreadcrumb', () => {
  it('konsol, dokunma, ağ ve diğer kategoriler atılır', () => {
    for (const category of ['console', 'ui.click', 'ui.tap', 'xhr', 'fetch', 'http', 'touch', 'sentry.event', undefined]) {
      expect(scrubBreadcrumb({ category, message: 'Su iç', data: { label: 'Annemi ara' } })).toBeNull();
    }
  });

  it('gezinme korunur ama veri çantası ve mesaj düşer', () => {
    const b = scrubBreadcrumb({ category: 'navigation', type: 'navigation', level: 'info', timestamp: 5, message: 'x', data: { from: '/a', to: '/habit/abc' } });
    expect(b).toEqual({ category: 'navigation', type: 'navigation', level: 'info', timestamp: 5 });
  });
});

describe('scrubEvent', () => {
  const base = () => ({
    user: { id: 'u', email: 'a@b.c', ip_address: '1.2.3.4' },
    request: { url: 'https://x/rest/v1/habits?title=eq.Su', headers: { Authorization: 'Bearer secret' } },
    extra: { title: 'Annemi ara' },
    contexts: { device: { model: 'Redmi' }, os: { name: 'Android' }, custom: { note: 'Su iç' } },
    breadcrumbs: [
      { category: 'console', message: 'Habit "Su iç" saved' },
      { category: 'navigation', data: { to: '/habit/1' } },
    ],
    exception: { values: [{ type: 'Error', value: 'Cannot read "Annemi ara" of undefined' }] },
    message: 'failed for “Süt al”',
    release: 'erek@1.1.0',
  });

  it('kullanıcı, istek, ek veri ve serbest bağlamlar silinir; teknik bilgi kalır', () => {
    const out = scrubEvent(base());
    expect(out).not.toHaveProperty('user');
    expect(out).not.toHaveProperty('request');
    expect(out).not.toHaveProperty('extra');
    expect(Object.keys(out.contexts!)).toEqual(['device', 'os']);
    expect(out.release).toBe('erek@1.1.0');
  });

  it('breadcrumb temizlenir', () => {
    expect(scrubEvent(base()).breadcrumbs).toEqual([{ category: 'navigation', type: undefined, level: undefined, timestamp: undefined }]);
  });

  it('hata mesajındaki tırnak içi metin maskelenir, uzunluk sınırlanır', () => {
    const out = scrubEvent(base());
    expect(out.exception!.values![0].value).toBe('Cannot read "…" of undefined');
    expect(out.message).toBe('failed for “…”');
    const long = scrubEvent({ message: 'x'.repeat(5000) });
    expect(long.message!.length).toBe(MAX_MESSAGE_LEN);
  });

  it('eksik alanlarla çökmez, girdiyi değiştirmez', () => {
    expect(scrubEvent({})).toEqual({});
    const input = base();
    const copy = JSON.parse(JSON.stringify(input));
    scrubEvent(input);
    expect(input).toEqual(copy);
  });
});
