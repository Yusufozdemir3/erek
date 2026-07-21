// Puan grafiği — yatayda KAYDIRILABİLİR (bkz. habit/[id].tsx): az nokta varken
// (ör. sadece 4 hafta) nokta aralığı KONTEYNERİ DOLDURACAK şekilde esner —
// aksi halde grafik sol kenara yapışıp sağda çirkin bir boşluk bırakıyordu
// (kullanıcı geri bildirimi). Nokta sayısı arttıkça (ör. 20+ gün) aralık asgari
// genişliğe (POINT_SPACING) düşer ve ScrollView devreye girip kaydırma başlar.
// Basamaklı ('step') ve düz çizgi ('line') iki mod da var; kullanıcı basamaklıyı
// tercih etti (variant="step" olarak çağrılıyor, bkz. habit/[id].tsx).

import { Fragment, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

const POINT_SPACING_MIN = 30; // nokta başına ASGARİ piksel (bunun altına inmez)
const MARGIN_LEFT = 30; // %0-100 eksen etiketleri için sol boşluk
const MARGIN_RIGHT = 4;
const VB_H = 170;
const Y_TOP = 12;
const Y_BASE = 140;
const GRID_STEPS = [0, 20, 40, 60, 80, 100];

export interface ScoreLineChartProps {
  /** Her nokta için 0..1 değer + alt eksende gösterilecek kısa etiket.
   *  partial=true: bu nokta henüz BİTMEMİŞ bir kovaya ait (bugün / süren
   *  hafta-ay) — soluk/kesikli çizilir, "Geçmiş" kartındaki partial kovalarla
   *  aynı görsel dil (kullanıcı geri bildirimi: bitmemiş dönem bitmiş gibi
   *  görünüyordu). */
  points: { value: number; label: string; partial?: boolean }[];
  color: string;
  gridColor: string;
  labelColor: string;
  variant?: 'line' | 'step';
}

export function ScoreLineChart({ points, color, gridColor, labelColor, variant = 'line' }: ScoreLineChartProps) {
  const n = points.length;
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  if (n === 0) return <View onLayout={onLayout} />;

  // Nokta aralığı: konteynerin izin verdiği kadar geniş (az noktada dolduk
  // hissi versin), ama asgari POINT_SPACING_MIN'in altına inmez (çok noktada
  // sıkışmasın, ScrollView devreye girsin).
  const availableForPoints = Math.max(0, containerWidth - MARGIN_LEFT - MARGIN_RIGHT);
  const spacing =
    containerWidth > 0 && n > 1
      ? Math.max(POINT_SPACING_MIN, availableForPoints / (n - 1))
      : POINT_SPACING_MIN;
  const chartW = MARGIN_LEFT + MARGIN_RIGHT + Math.max(1, n - 1) * spacing;
  const xAt = (i: number) => MARGIN_LEFT + i * spacing;
  const yAt = (v: number) => Y_BASE - Math.max(0, Math.min(1, v)) * (Y_BASE - Y_TOP);
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));

  // Son nokta bitmemiş bir kovaya (bugün / süren hafta-ay) aitse, ona giden
  // son parça ayrı, soluk/kesikli bir "kuyruk" olarak çizilir — ana çizgi
  // ondan önce biter. Tek noktalık grafikte kuyruk için ikinci nokta yok,
  // dokunmadan geç.
  const lastIsPartial = points.length > 1 && points[points.length - 1].partial === true;
  const mainCoords = lastIsPartial ? coords.slice(0, -1) : coords;

  const pathFor = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    if (variant === 'step') {
      for (let i = 1; i < pts.length; i++) d += ` H${pts[i].x} V${pts[i].y}`;
    } else {
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
    }
    return d;
  };

  const linePath = pathFor(mainCoords);
  const tailPath = lastIsPartial ? pathFor(coords.slice(-2)) : '';

  const scrollRef = useRef<ScrollView>(null);
  // Yalnız İLK ölçümde sona kaydır — onContentSizeChange her yeniden
  // render'da (ör. üst ekran odaklandığında stats yenilenince) tekrar
  // tetiklenebiliyordu ve kullanıcı elle kaydırırken görünümü geri
  // "sağa" çekip kaydırmayı bozuyordu (kullanıcı geri bildirimi).
  const didAutoScroll = useRef(false);

  return (
    <View onLayout={onLayout}>
      {containerWidth > 0 && (
        // En güncel veri (sağ uç) varsayılan görünüm — açılışta otomatik oraya
        // kaydırılır, kullanıcı geçmişe gitmek için SOLA kaydırır.
        // nestedScrollEnabled: bu yatay ScrollView, ekranı saran DİKEY ScrollView'ın
        // İÇİNDE — Android'de bu olmadan dış kaydırma parmak hareketini kapıp
        // yatay kaydırmayı "takılıyor/tepki vermiyor" gibi hissettiriyordu.
        <ScrollView
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => {
            if (didAutoScroll.current) return;
            didAutoScroll.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          <View>
            <Svg width={chartW} height={VB_H * 0.68} viewBox={`0 0 ${chartW} ${VB_H}`}>
              {GRID_STEPS.map((g) => {
                const y = Y_BASE - (g / 100) * (Y_BASE - Y_TOP);
                return (
                  <Fragment key={g}>
                    <Line
                      x1={MARGIN_LEFT}
                      y1={y}
                      x2={chartW - MARGIN_RIGHT}
                      y2={y}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <SvgText x={MARGIN_LEFT - 6} y={y + 3} fill={labelColor} fontSize={8} textAnchor="end">
                      {`%${g}`}
                    </SvgText>
                  </Fragment>
                );
              })}
              {linePath !== '' && (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {tailPath !== '' && (
                <Path
                  d={tailPath}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.4}
                  strokeWidth={2}
                  strokeDasharray="4,3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {coords.map((c, i) => (
                <Circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={i === coords.length - 1 ? 4 : 2.5}
                  fill={color}
                  fillOpacity={points[i].partial ? 0.4 : 1}
                />
              ))}
            </Svg>
            <View style={{ width: chartW, flexDirection: 'row' }}>
              {points.map((p, i) => (
                <Text
                  key={i}
                  style={{ width: spacing, fontSize: 8, fontWeight: '600', color: labelColor, textAlign: 'center' }}
                  numberOfLines={1}
                >
                  {p.label}
                </Text>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
