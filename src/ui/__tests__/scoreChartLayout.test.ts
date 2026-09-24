// Score chart layout tests.
//
// REGRESSION (caught on an emulator, 2026-07-23): for a chart with a SINGLE
// point, the plot area was inflated by a whole extra `spacing`
// (`Math.max(1, n-1) * spacing`), overflowing the screen; the ScrollView
// auto-scrolled to the end on open, leaving the single point off-screen on
// the left — the user saw an EMPTY-looking chart. This only became possible
// once the score lock was removed (previously the chart wasn't drawn with
// fewer than 7 days of data).

import { AXIS_W, chartLayout, LABEL_W_MAX, POINT_SPACING_MIN } from '../scoreChartLayout';

const WIDTH = 340; // typical phone card width (dp)
const available = WIDTH - AXIS_W;

describe('chartLayout — tek nokta', () => {
  it('çizim alanı kaba SIĞAR (kaydırma gerekmez)', () => {
    const { plotW } = chartLayout(1, WIDTH);
    expect(plotW).toBeLessThanOrEqual(available);
  });

  it('tek nokta görünür alanda kalır (etiket kutusunun ortasında)', () => {
    const { xAt, labelW, plotW } = chartLayout(1, WIDTH);
    expect(xAt(0)).toBe(labelW / 2);
    expect(xAt(0)).toBeLessThan(plotW); // INSIDE the area
    expect(xAt(0)).toBeGreaterThan(0);
  });

  it('genişlik yalnız etiket kutusudur — fazladan aralık eklenmez', () => {
    const { plotW, labelW } = chartLayout(1, WIDTH);
    expect(plotW).toBe(labelW);
  });
});

describe('chartLayout — çok nokta', () => {
  it('az noktada aralık kabı DOLDURACAK şekilde esner', () => {
    const { plotW } = chartLayout(4, WIDTH);
    expect(plotW).toBeCloseTo(available, 5);
  });

  it('çok noktada aralık asgariye iner ve kaydırma başlar', () => {
    const { spacing, plotW } = chartLayout(60, WIDTH);
    expect(spacing).toBe(POINT_SPACING_MIN);
    expect(plotW).toBeGreaterThan(available);
  });

  it('noktalar eşit aralıklı ve artan sırada', () => {
    const { xAt, spacing } = chartLayout(5, WIDTH);
    for (let i = 1; i < 5; i++) {
      expect(xAt(i) - xAt(i - 1)).toBeCloseTo(spacing, 5);
    }
  });

  it('etiket kutusu asla üst sınırı aşmaz', () => {
    for (const n of [1, 2, 5, 30, 90]) {
      expect(chartLayout(n, WIDTH).labelW).toBeLessThanOrEqual(LABEL_W_MAX);
    }
  });

  it('hiçbir nokta sayısında ilk nokta negatif x almaz', () => {
    for (const n of [1, 2, 3, 12, 30, 90]) {
      expect(chartLayout(n, WIDTH).xAt(0)).toBeGreaterThan(0);
    }
  });
});

describe('chartLayout — sınır durumlar', () => {
  it('kap henüz ölçülmemişken (0) asgari aralığa düşer', () => {
    expect(chartLayout(5, 0).spacing).toBe(POINT_SPACING_MIN);
  });

  it('sıfır noktada bölme hatası vermez', () => {
    expect(() => chartLayout(0, WIDTH)).not.toThrow();
    expect(Number.isFinite(chartLayout(0, WIDTH).plotW)).toBe(true);
  });

  it('çok dar kapta bile geçerli sayılar üretir', () => {
    const l = chartLayout(10, AXIS_W); // no room left for the plot
    expect(Number.isFinite(l.spacing)).toBe(true);
    expect(l.spacing).toBe(POINT_SPACING_MIN);
  });
});
