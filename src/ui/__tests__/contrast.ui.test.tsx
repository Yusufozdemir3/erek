// WCAG AA (4.5:1) for the text tones (text/muted/faint) on the screen and card
// backgrounds, so a palette tweak can't quietly cost readability. Border, line
// and track aren't text and are excluded.

import { blackColors, darkColors, lightColors, percentLabel, switchColors, type Colors } from '@/ui/theme';
import { MISSED_TINT_ALPHA } from '@/ui/habit/habitStatsStyles';

// Linearizes an sRGB channel (WCAG 2.x definition).
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;

const PALETTES: [name: string, colors: Colors][] = [
  ['açık', lightColors],
  ['koyu (sıcak)', darkColors],
  ['koyu (tam siyah)', blackColors],
];

// Text-bearing tones. onAccent is handled separately (its background is the
// accent color, not the theme background) — accent colors are user-selected, a separate concern.
const TEXT_TOKENS: (keyof Colors)[] = ['text', 'muted', 'faint'];

describe('metin kontrastı — WCAG AA', () => {
  it.each(PALETTES)('%s tema: metin tonları ekran zemininde AA geçer', (_name, colors) => {
    const failing = TEXT_TOKENS.filter((token) => ratio(colors[token], colors.bg) < AA_BODY).map(
      (token) => `${token} (${ratio(colors[token], colors.bg).toFixed(2)}:1)`
    );
    expect(failing).toEqual([]);
  });

  it.each(PALETTES)('%s tema: metin tonları KART zemininde de AA geçer', (_name, colors) => {
    // Cards differ from the screen background, so both are measured.
    const failing = TEXT_TOKENS.filter((token) => ratio(colors[token], colors.card) < AA_BODY).map(
      (token) => `${token} (${ratio(colors[token], colors.card).toFixed(2)}:1)`
    );
    expect(failing).toEqual([]);
  });

  it.each(PALETTES)('%s tema: üç kademe arasındaki hiyerarşi korunur', (_name, colors) => {
    // text > muted > faint must stay in order.
    const t = ratio(colors.text, colors.bg);
    const m = ratio(colors.muted, colors.bg);
    const f = ratio(colors.faint, colors.bg);
    expect(t).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(f);
  });

  it('renkli düğme üstündeki metin (onAccent) vurgu renginde okunur', () => {
    // onAccent is white in both themes; its background is the accent color.
    // We measure against the default accent — other accents the user can pick are a separate concern.
    expect(ratio(lightColors.onAccent, lightColors.primary)).toBeGreaterThanOrEqual(4.5);
  });

  // A missed calendar day's number must stay readable on its tint.
  it.each(PALETTES)('%s tema: takvimde kaçırılan günün rakamı tonlu hücrede okunur', (_name, colors) => {
    const a = parseInt(MISSED_TINT_ALPHA, 16) / 255;
    const mix = (fg: string, bg: string) => {
      const ch = (h: string, i: number) => parseInt(h.replace('#', '').slice(i, i + 2), 16);
      const out = [0, 2, 4].map((i) => Math.round(ch(fg, i) * a + ch(bg, i) * (1 - a)));
      return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    expect(ratio(colors.text, mix(colors.danger, colors.card))).toBeGreaterThanOrEqual(AA_BODY);
  });

  // Non-text 3:1 (WCAG 1.4.11): the thumb must stand out from its track.
  it.each(PALETTES)('%s tema: açma-kapama düğmesinin yuvarlağı izinden ayırt edilir', (_name, colors) => {
    const on = switchColors(colors, true);
    const off = switchColors(colors, false);
    expect(ratio(on.thumbColor, on.trackColor.true)).toBeGreaterThanOrEqual(3);
    expect(ratio(off.thumbColor, off.trackColor.false)).toBeGreaterThanOrEqual(3);
  });
});

describe('percentLabel', () => {
  it('her dilin kendi yazımını kullanır', () => {
    expect(percentLabel(53, 'tr')).toBe('%53');
    expect(percentLabel(53, 'en')).toBe('53%');
    expect(percentLabel(53, 'de')).toBe('53 %');
  });
});
