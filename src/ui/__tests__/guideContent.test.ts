// Özellik rehberleri: her sayfanın başlığı, metni (ve düğmesi) üç dilde de yazılmış olmalı;
// eksik anahtar ekranda ham anahtar adı olarak görünürdü.

import { translations } from '@/i18n/translations';
import { GUIDE_IDS } from '@/lib/guides';
import { GUIDES } from '../guide/guideContent';

const LANGS = ['tr', 'en', 'de'] as const;

describe('rehber içeriği', () => {
  it('her rehberin sayfaları var', () => {
    for (const id of GUIDE_IDS) expect(GUIDES[id].length).toBeGreaterThan(0);
  });

  it.each(GUIDE_IDS)('%s: her sayfa üç dilde başlık + metin (+ düğme) taşır', (id) => {
    GUIDES[id].forEach((page, i) => {
      const parts = ['title', 'body', ...(page.cta ? ['cta'] : [])];
      for (const lang of LANGS) {
        for (const part of parts) {
          const key = `guide.${id}.${i + 1}.${part}`;
          const value = (translations[lang] as Record<string, string>)[key];
          expect(value && value.trim().length > 0).toBe(true);
        }
      }
    });
  });

  it('rota veren düğmeler gerçek sekmelere gider', () => {
    const routes = Object.values(GUIDES).flat().flatMap((p) => (p.cta?.route ? [p.cta.route] : []));
    for (const r of routes) expect(r).toMatch(/^\/\(tabs\)\/(habits|goals|tasks|index)$/);
  });

  it('metinler çok uzun değil (kart ekrana sığsın)', () => {
    for (const id of GUIDE_IDS) {
      GUIDES[id].forEach((_, i) => {
        for (const lang of LANGS) {
          const body = (translations[lang] as Record<string, string>)[`guide.${id}.${i + 1}.body`];
          expect(body.length).toBeLessThanOrEqual(330);
        }
      });
    }
  });
});
