// Puan grafiğinin YERLEŞİM matematiği — ScoreLineChart.tsx'ten AYRILDI.
// React'siz olduğu için 'logic' test projesinde doğrudan doğrulanabilir; bu
// hesabın sessizce bozulması grafiği görünmez yapabiliyor (aşağıdaki nota bak).

// Nokta başına ASGARİ piksel (bunun altına inmez; altına inerse kaydırma başlar).
export const POINT_SPACING_MIN = 30;
// SABİT sol eksen şeridinin genişliği ("%100" yazısına göre).
export const AXIS_W = 40;
// Alt eksen etiket kutusunun ÜST SINIRI: nokta aralığından geniş olamaz (yoksa
// komşu etiketler çakışır), az noktada aralık çok açıldığında da bununla sınırlı.
export const LABEL_W_MAX = 48;

export interface ChartLayout {
  spacing: number; // iki nokta arası mesafe
  labelW: number; // alt eksen etiket kutusunun genişliği
  plotW: number; // kaydırılabilir çizim alanının TOPLAM genişliği
  xAt: (i: number) => number; // i. noktanın x'i
}

// n nokta ve ölçülen kap genişliği için yerleşimi çözer.
//
// İki rejim var, çünkü etiket kutusu spacing ile LABEL_W_MAX'in küçüğü:
//   dar   (labelW = spacing)     -> plotW = n * spacing
//   geniş (labelW = LABEL_W_MAX) -> plotW = (n-1) * spacing + LABEL_W_MAX
// Hangisi geçerliyse ondan çözülür; ikisi de plotW = availableForPlot verir,
// yani grafik kartı TAM doldurur. İlk/son noktanın etiketi yarım kutu taştığı
// için bu pay hesaba katılır — aksi halde tam sığması gereken grafik bile
// kaydırılabilir hale geliyordu.
//
// TEK NOKTA (n=1) ÖZEL: plotW eskiden `Math.max(1, n - 1) * spacing + labelW`
// ile hesaplanıyordu; n=1'de max(1,0)=1 olduğu için çizim alanı bir TAM spacing
// kadar şişiyor, ekrandan taşıyor, ScrollView açılışta sona kayıyor ve tek nokta
// solda görünmez alanda kalıyordu — grafik BOŞ görünüyordu (emülatörde 2026-07-23
// yakalandı). Bu durum ancak puan kilidi (SCORE_MIN_DAYS) kaldırılınca mümkün
// hale geldi: öncesinde 7 günden az veriyle grafik hiç çizilmiyordu.
export function chartLayout(n: number, containerWidth: number): ChartLayout {
  const availableForPlot = Math.max(0, containerWidth - AXIS_W);
  const narrowFit = availableForPlot / Math.max(1, n);
  const fitSpacing =
    narrowFit < LABEL_W_MAX
      ? narrowFit
      : n > 1
        ? (availableForPlot - LABEL_W_MAX) / (n - 1)
        : availableForPlot;
  const spacing = containerWidth > 0 ? Math.max(POINT_SPACING_MIN, fitSpacing) : POINT_SPACING_MIN;
  const labelW = Math.min(spacing, LABEL_W_MAX);
  // n<=1 iken aralık YOKTUR: genişlik yalnız etiket kutusudur.
  const plotW = (n > 1 ? (n - 1) * spacing : 0) + labelW;
  return { spacing, labelW, plotW, xAt: (i: number) => labelW / 2 + i * spacing };
}
