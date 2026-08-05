// METİN KONTRASTI — WCAG AA (4.5:1) bekçisi.
//
// NEDEN VAR: renk paleti elle ayarlanıyor ve bir tonu "biraz daha soluk yapalım"
// demek sessizce erişilebilirlik kaybı demek. Denetimde bulunan durum tam buydu:
// `faint` açık temada 2.5:1 idi ve o ton form placeholder'ları, ipucu satırları,
// dipnotlar gibi GERÇEK içerikte kullanılıyordu — yani güneş altında veya yaşa
// bağlı görme kaybında okunmayan metin.
//
// Kapsam: metin taşıyan tonlar (text/muted/faint) hem ekran zemininde hem kart
// zemininde ölçülür. Süs/ayraç tonları (border, line, track) metin DEĞİLDİR ve
// AA gövde eşiğine tabi değildir — bilerek dışarıda.

import { blackColors, darkColors, lightColors, type Colors } from '@/ui/theme';

// sRGB kanalını doğrusallaştırır (WCAG 2.x tanımı).
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

// Metin taşıyan tonlar. onAccent ayrı ele alınır (zemini vurgu rengidir, temanın
// zemini değil) — vurgu renkleri kullanıcı tarafından seçildiği için ayrı bir konu.
const TEXT_TOKENS: (keyof Colors)[] = ['text', 'muted', 'faint'];

describe('metin kontrastı — WCAG AA', () => {
  it.each(PALETTES)('%s tema: metin tonları ekran zemininde AA geçer', (_name, colors) => {
    const failing = TEXT_TOKENS.filter((token) => ratio(colors[token], colors.bg) < AA_BODY).map(
      (token) => `${token} (${ratio(colors[token], colors.bg).toFixed(2)}:1)`
    );
    expect(failing).toEqual([]);
  });

  it.each(PALETTES)('%s tema: metin tonları KART zemininde de AA geçer', (_name, colors) => {
    // Metnin çoğu kart üstünde; kart zemini ekran zemininden farklı olduğu için
    // ayrıca ölçülmeli (açık temada kart beyaz, ekran hafif gri).
    const failing = TEXT_TOKENS.filter((token) => ratio(colors[token], colors.card) < AA_BODY).map(
      (token) => `${token} (${ratio(colors[token], colors.card).toFixed(2)}:1)`
    );
    expect(failing).toEqual([]);
  });

  it.each(PALETTES)('%s tema: üç kademe arasındaki hiyerarşi korunur', (_name, colors) => {
    // text en okunaklı, faint en soluk olmalı. Hepsi eşiği geçsin diye tonlar
    // koyulaştırılırken sıranın bozulması (ör. faint'in muted'dan koyu çıkması)
    // görsel hiyerarşiyi sessizce ters çevirirdi.
    const t = ratio(colors.text, colors.bg);
    const m = ratio(colors.muted, colors.bg);
    const f = ratio(colors.faint, colors.bg);
    expect(t).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(f);
  });

  it('renkli düğme üstündeki metin (onAccent) vurgu renginde okunur', () => {
    // onAccent iki temada da beyaz; zemini vurgu rengidir. Varsayılan vurgu ile
    // ölçüyoruz — kullanıcının seçebildiği diğer vurgular ayrı bir konu.
    expect(ratio(lightColors.onAccent, lightColors.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
