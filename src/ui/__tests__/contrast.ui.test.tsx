// TEXT CONTRAST — a WCAG AA (4.5:1) guard.
//
// WHY THIS EXISTS: the color palette is tuned by hand, and saying "let's make
// this tone a bit fainter" silently means losing accessibility. That's
// exactly what the audit found: `faint` was 2.5:1 in light theme, and that
// tone was used in REAL content like form placeholders, hint lines, and
// footnotes — i.e. text that's unreadable in sunlight or with age-related
// vision loss.
//
// Scope: text-bearing tones (text/muted/faint) are measured against both the
// screen background and the card background. Decorative/divider tones
// (border, line, track) are NOT text and aren't subject to the AA body
// threshold — deliberately excluded.

import { blackColors, darkColors, lightColors, type Colors } from '@/ui/theme';

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
    // Most text sits on cards; since the card background differs from the
    // screen background, it must be measured separately (in light theme the card is white, the screen a light gray).
    const failing = TEXT_TOKENS.filter((token) => ratio(colors[token], colors.card) < AA_BODY).map(
      (token) => `${token} (${ratio(colors[token], colors.card).toFixed(2)}:1)`
    );
    expect(failing).toEqual([]);
  });

  it.each(PALETTES)('%s tema: üç kademe arasındaki hiyerarşi korunur', (_name, colors) => {
    // text should be the most legible, faint the palest. If the ordering
    // broke while darkening tones to clear the threshold (e.g. faint ending
    // up darker than muted), it would silently invert the visual hierarchy.
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
});
