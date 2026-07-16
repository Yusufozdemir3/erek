// Salt View ile çubuk grafik — SVG/native bağımlılığı yok (LineChart'ın yerini
// aldı; bkz. SwipeableRow'daki "sıfır yeni bağımlılık" kararı). Her çubuk bir
// zaman kovası (gün/hafta/ay), yüksekliği 0..1 oranı. Son kova "şu an" vurgusu
// için tam opak, geçmiş kovalar yarı saydam. Oranı 0 olan kovada zeminden hafif
// ayrılan kısa bir iz (stub) bırakılır ki kovanın varlığı okunabilsin.
//
// Etiketler çubukların ALTINA ayrı bir satırda, space-between ile serpiştirilir
// (çubuk başına etiket 30 kovada sığmaz; çağıran 2-4 seyrek etiket verir).

import { Text, View } from 'react-native';

export interface BarChartProps {
  /** Her kovanın 0..1 oranı (soldan sağa, en eskiden en yeniye). */
  ratios: number[];
  color: string;
  /** Boş kova izi + zemin çizgisi rengi (temanın track tonu). */
  trackColor: string;
  /** Seyrek eksen etiketleri (2-4 adet), space-between dizilir. */
  labels: string[];
  labelColor: string;
  height?: number;
}

export function BarChart({
  ratios,
  color,
  trackColor,
  labels,
  labelColor,
  height = 110,
}: BarChartProps) {
  const many = ratios.length > 16;
  const gap = many ? 2 : 5;
  const radius = many ? 2.5 : 5;

  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {ratios.map((r, i) => {
          const clamped = Math.max(0, Math.min(1, r));
          const isLast = i === ratios.length - 1;
          const empty = clamped <= 0;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: `${empty ? 4 : Math.max(5, Math.round(clamped * 100))}%`,
                borderRadius: radius,
                backgroundColor: empty ? trackColor : color,
                opacity: empty || isLast ? 1 : 0.45,
              }}
            />
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: trackColor, marginTop: 4 }} />
      {labels.length > 0 && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ fontSize: 10, fontWeight: '600', color: labelColor }}>
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
