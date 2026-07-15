// Salt View ile alan (area) + çizgi grafiği — yeni bir SVG/native bağımlılığı
// gerektirmesin diye her şey konumlandırılmış View'lerle çizilir:
//  • Alan dolgusu: her veri noktasında, zemine kadar inen soluk (opacity) bitişik
//    dikey bir sütun — çizginin altını "doldurup" derinlik hissi verir.
//  • Çizgi: ardışık noktalar, döndürülmüş ince segmentlerle birleştirilir
//    (segmentin uzunluğu/açısı iki nokta arasından hesaplanıp orta noktasına
//    yerleştirilip döndürülür), uçları yuvarlatılmış.
//  • Uç nokta: son değerde içi dolu bir daire + zeminle aynı renkte halka —
//    "şu an buradayız" vurgusu.
//
// Genişlik onLayout ile ölçülür. values: her biri 0..1 (1 = üst, 0 = alt),
// aralık dışı kırpılır. Tek nokta gelirse ortada bir işaret çizilir.

import { useState } from 'react';
import { View } from 'react-native';

interface LineChartProps {
  values: number[];
  color: string;
  height?: number;
  strokeWidth?: number;
  /** Uç noktadaki halka rengi (kartın zemin rengi) — daireyi zeminden ayırır. */
  dotRingColor?: string;
}

export function LineChart({
  values,
  color,
  height = 72,
  strokeWidth = 2.5,
  dotRingColor = '#ffffff',
}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const pad = strokeWidth + 2; // çizgi/daire kenarlardan taşmasın
  const usableH = Math.max(0, height - pad * 2);

  const points =
    width > 0 && values.length > 0
      ? values.map((v, i) => {
          const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
          const clamped = Math.max(0, Math.min(1, v));
          const y = pad + (1 - clamped) * usableH;
          return { x, y };
        })
      : [];

  // Alan sütunları: her nokta bir dikey bar; genişlik komşu aralığa göre ki
  // sütunlar bitişip kesintisiz bir alan gibi görünsün.
  const colW = points.length > 1 ? width / (points.length - 1) : width;

  const segments: { key: number; left: number; top: number; width: number; angle: string }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx); // radyan; RN 'rad' son ekini kabul eder
    segments.push({
      key: i,
      left: (a.x + b.x) / 2 - len / 2,
      top: (a.y + b.y) / 2 - strokeWidth / 2,
      width: len,
      angle: `${angle}rad`,
    });
  }

  const last = points.length > 0 ? points[points.length - 1] : null;

  return (
    <View
      style={{ height, width: '100%', overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {/* Alan dolgusu — çizginin altını soluk renkle doldurur. */}
      {points.map((p, i) => (
        <View
          key={`f${i}`}
          style={{
            position: 'absolute',
            left: p.x - colW / 2,
            top: p.y,
            width: colW + 0.5, // hafif bindirme: sütunlar arasında boşluk kalmasın
            bottom: 0,
            backgroundColor: color,
            opacity: 0.12,
          }}
        />
      ))}

      {/* Çizgi segmentleri. */}
      {segments.map((s) => (
        <View
          key={s.key}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.width,
            height: strokeWidth,
            borderRadius: strokeWidth / 2,
            backgroundColor: color,
            transform: [{ rotate: s.angle }],
          }}
        />
      ))}

      {/* Uç nokta işareti (son değer). */}
      {last && (
        <View
          style={{
            position: 'absolute',
            left: last.x - (strokeWidth + 2),
            top: last.y - (strokeWidth + 2),
            width: (strokeWidth + 2) * 2,
            height: (strokeWidth + 2) * 2,
            borderRadius: strokeWidth + 2,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: dotRingColor,
          }}
        />
      )}
    </View>
  );
}
