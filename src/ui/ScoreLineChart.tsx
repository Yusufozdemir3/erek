// Puan grafiği — SVG YOK, tamamen düz React Native View'larıyla çizilir
// (kullanıcı isteği). Grafik "basamaklı" (step) olduğu için her parça zaten
// eksen-hizalı bir dikdörtgen: yatay parça + dikey parça. Çapraz çizgi
// gerektiren eski 'line' varyantı KALDIRILDI — hiç kullanılmıyordu (tek çağıran
// habit/[id].tsx, hep variant="step" veriyordu); View'larla çapraz çizgi ancak
// döndürme hilesiyle olurdu ve karşılığı yoktu. Gerekirse git geçmişinden alınır.
//
// ÖLÇÜ BİRİMİ: hepsi doğrudan piksel (dp). Eskiden bir SVG viewBox'ı vardı ve
// viewBox oranı ile çizim kutusunun oranı uyuşmadığı için preserveAspectRatio
// varsayılanı ("xMidYMid meet") tüm grafiği %68'e küçültüp ortalıyordu — yanlarda
// ölü boşluk, 8px yerine 5.4px yazılar, noktalardan kayan alt eksen etiketleri.
// Ölçek katmanı olmadığı için o sınıf hata artık mümkün değil: ne yazarsan o.
//
// YERLEŞİM: iki parça yan yana. SOLDA yüzde ekseni (%0..%100) — SABİT, ScrollView'ın
// DIŞINDA; SAĞDA kaydırılabilir çizim alanı. Eskiden eksen de kaydırma alanının
// içindeydi ve geçmişe kaydırırken yüzdeler ekrandan çıkıp grafik ölçeksiz
// kalıyordu (kullanıcı isteği: "yüzdeleri sol başa sabitle, sadece günler
// hareket etsin"). Bu yüzden çizim alanının x koordinatları 0'dan başlar —
// eksen genişliği (AXIS_W) çizime dahil DEĞİL.
//
// Az nokta varken (ör. sadece 4 hafta) nokta aralığı KONTEYNERİ DOLDURACAK
// şekilde esner — aksi halde grafik sol kenara yapışıp sağda çirkin bir boşluk
// bırakıyordu (kullanıcı geri bildirimi). Nokta sayısı arttıkça aralık asgari
// genişliğe (POINT_SPACING_MIN) düşer ve ScrollView devreye girip kaydırma başlar.

import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, ScrollView, Text, View } from 'react-native';

// ÖLÇEK: referans Loop Habit Tracker'ın puan grafiği (kullanıcı videosu). Eski
// değerler (110px yükseklik, 8px yazı) yanındaki "Geçmiş" kartına göre basık
// kalıyor ve telefonda yazılar okunmuyordu (kullanıcı geri bildirimi: "ekrana
// tam oturmuyor, yazılar çok küçük"). Loop'ta çizim alanı ~145dp, eksen/gün
// yazıları ~10dp; buradaki sayılar onun oranlarına denk gelir.
const POINT_SPACING_MIN = 30; // nokta başına ASGARİ piksel (bunun altına inmez)
const AXIS_W = 40; // SABİT sol eksen şeridinin genişliği ("%100" yazısına göre)
// Yüzde yazısı ile çizim alanı arasındaki boşluk. Yazılar şeridin SAĞINA
// yaslı (sayıların sağ kenarları hizalı okunur); bu payı büyütmek onları
// topluca sola kaydırır — 6 iken çizgiye fazla yapışıklardı (kullanıcı isteği).
const AXIS_GAP = 14;
// Çizim alanının yüksekliği ve içindeki %100 / %0 çizgilerinin y'si.
// Y_BASE'in altında kalan boşluk, alt eksen etiket satırıyla arasındaki nefes payı.
const CHART_H = 172;
const Y_TOP = 12;
const Y_BASE = 156;
// Alt eksen etiket kutusunun genişliği: nokta aralığından geniş olamaz (yoksa
// komşu etiketler çakışır) ama az noktada aralık çok açıldığında da bu kadarla
// sınırlı kalır — etiket her hâlükârda kendi noktasının ÜSTÜNE ortalanır.
const LABEL_W_MAX = 48;
const LABEL_ROW_H = 16;
const LABEL_FONT = 10;
const AXIS_FONT = 10;
const AXIS_LINE_H = 12;
const GRID_STEPS = [0, 20, 40, 60, 80, 100];
const STROKE = 2.5; // çizgi kalınlığı
const DOT_R = 3.5;
const DOT_R_LAST = 5; // son nokta vurgulu
const PARTIAL_OPACITY = 0.4; // bitmemiş kova: soluk
const DASH_LEN = 4; // bitmemiş kuyruk: 4px çizgi / 3px boşluk
const DASH_GAP = 3;

// Mutlak konumlu bir dikdörtgen (çizgi parçası). Tüm çizim bunlardan oluşur.
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// İki nokta arasındaki BASAMAK: önce a.y seviyesinde yatay git, sonra b.x'te
// dikey in/çık. Dikey parça iki ucundan STROKE/2 taşırılır — köşede boşluk
// kalmasın (SVG'deki strokeLinejoin="round" karşılığı).
function stepRects(a: { x: number; y: number }, b: { x: number; y: number }): Rect[] {
  return [
    { left: a.x, top: a.y - STROKE / 2, width: b.x - a.x, height: STROKE },
    {
      left: b.x - STROKE / 2,
      top: Math.min(a.y, b.y) - STROKE / 2,
      width: STROKE,
      height: Math.abs(b.y - a.y) + STROKE,
    },
  ];
}

// Bir parçayı kesikli çizgiye böler (SVG'deki strokeDasharray="4,3" karşılığı).
// Uzun ekseni boyunca DASH_LEN uzunluğunda parçalar, aralarında DASH_GAP.
function dashRects(seg: Rect): Rect[] {
  const horizontal = seg.width >= seg.height;
  const len = horizontal ? seg.width : seg.height;
  const out: Rect[] = [];
  for (let offset = 0; offset < len; offset += DASH_LEN + DASH_GAP) {
    const size = Math.min(DASH_LEN, len - offset);
    out.push(
      horizontal
        ? { ...seg, left: seg.left + offset, width: size }
        : { ...seg, top: seg.top + offset, height: size }
    );
  }
  return out;
}

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
}

export function ScoreLineChart({ points, color, gridColor, labelColor }: ScoreLineChartProps) {
  const n = points.length;
  const [containerWidth, setContainerWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  const scrollRef = useRef<ScrollView>(null);
  // Yalnız İLK ölçümde sona kaydır — onContentSizeChange her yeniden
  // render'da (ör. üst ekran odaklandığında stats yenilenince) tekrar
  // tetiklenebiliyordu ve kullanıcı elle kaydırırken görünümü geri
  // "sağa" çekip kaydırmayı bozuyordu (kullanıcı geri bildirimi).
  const didAutoScroll = useRef(false);
  // ...AMA periyot sekmesi (Gün/Hafta/Ay) değişince bileşen yeniden mount
  // OLMUYOR, sadece nokta sayısı değişiyor. Bayrak açık kaldığı için kaydırma
  // atlanıyor ve kullanıcı yeni grafiğin ortasında/solunda kalıyordu; "en
  // güncel veri sağda" garantisi ilk sekme değişiminde bozuluyordu. Nokta
  // sayısı değiştiğinde bayrağı sıfırlıyoruz — yenilenen stats aynı sayıda
  // kova döndürdüğü için elle kaydırma yine bozulmaz.
  useEffect(() => {
    didAutoScroll.current = false;
  }, [n]);

  if (n === 0) return <View onLayout={onLayout} />;

  // İki rejim var, çünkü etiket kutusu spacing ile LABEL_W_MAX'in küçüğü:
  //   dar  (labelW = spacing)     -> plotW = n * spacing
  //   geniş(labelW = LABEL_W_MAX) -> plotW = (n-1) * spacing + LABEL_W_MAX
  // Hangisi geçerliyse ondan çözülür; ikisi de plotW = availableForPlot verir,
  // yani grafik kartı TAM doldurur (tek formülle ~16px boşluk kalıyordu).
  // İlk/son noktanın etiketi yarım kutu taştığı için bu pay hesaba katılmalı —
  // aksi halde tam sığması gereken grafik bile kaydırılabilir hale geliyordu.
  const availableForPlot = Math.max(0, containerWidth - AXIS_W);
  const narrowFit = availableForPlot / n;
  const fitSpacing =
    narrowFit < LABEL_W_MAX ? narrowFit : n > 1 ? (availableForPlot - LABEL_W_MAX) / (n - 1) : availableForPlot;
  const spacing = containerWidth > 0 ? Math.max(POINT_SPACING_MIN, fitSpacing) : POINT_SPACING_MIN;
  const labelW = Math.min(spacing, LABEL_W_MAX);
  const plotW = Math.max(1, n - 1) * spacing + labelW;
  const xAt = (i: number) => labelW / 2 + i * spacing;
  const yAt = (v: number) => Y_BASE - Math.max(0, Math.min(1, v)) * (Y_BASE - Y_TOP);
  const coords = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));

  // Son nokta bitmemiş bir kovaya (bugün / süren hafta-ay) aitse, ona giden
  // son parça ayrı, soluk/kesikli bir "kuyruk" olarak çizilir — ana çizgi
  // ondan önce biter. Tek noktalık grafikte kuyruk için ikinci nokta yok.
  const lastIsPartial = n > 1 && points[n - 1].partial === true;
  const lineEnd = lastIsPartial ? n - 1 : n; // ana çizginin dahil ettiği nokta sayısı

  const solidRects: Rect[] = [];
  for (let i = 1; i < lineEnd; i++) solidRects.push(...stepRects(coords[i - 1], coords[i]));
  const tailRects: Rect[] = lastIsPartial
    ? stepRects(coords[n - 2], coords[n - 1]).flatMap(dashRects)
    : [];

  return (
    <View onLayout={onLayout}>
      {containerWidth > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {/* SABİT sol eksen — kaydırma alanının dışında, hep görünür. Yüzde
              yazıları çizim alanıyla AYNI yAt() formülünü kullanır, ikisi de
              CHART_H yüksekliğinde; satırlar birebir hizalı kalır. */}
          <View style={{ width: AXIS_W, height: CHART_H }}>
            {GRID_STEPS.map((g) => (
              <Text
                key={g}
                numberOfLines={1}
                style={{
                  position: 'absolute',
                  top: yAt(g / 100) - AXIS_LINE_H / 2,
                  width: AXIS_W - AXIS_GAP,
                  lineHeight: AXIS_LINE_H,
                  fontSize: AXIS_FONT,
                  color: labelColor,
                  textAlign: 'right',
                }}
              >
                {`%${g}`}
              </Text>
            ))}
          </View>
          {/* En güncel veri (sağ uç) varsayılan görünüm — açılışta otomatik oraya
              kaydırılır, kullanıcı geçmişe gitmek için SOLA kaydırır.
              nestedScrollEnabled: bu yatay ScrollView, ekranı saran DİKEY ScrollView'ın
              İÇİNDE — Android'de bu olmadan dış kaydırma parmak hareketini kapıp
              yatay kaydırmayı "takılıyor/tepki vermiyor" gibi hissettiriyordu. */}
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
              <View style={{ width: plotW, height: CHART_H }}>
                {/* Izgara çizgileri çizim alanının İÇİNDE kalır (eksen yazıları
                    dışarıda): yatay çizgiler tüm içerik genişliğini kapladığı
                    için kaydırırken sabit duruyormuş gibi görünür. */}
                {GRID_STEPS.map((g) => (
                  <View
                    key={g}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: yAt(g / 100),
                      width: plotW,
                      height: 1,
                      backgroundColor: gridColor,
                    }}
                  />
                ))}
                {solidRects.map((r, i) => (
                  <View key={`s${i}`} style={{ position: 'absolute', backgroundColor: color, ...r }} />
                ))}
                {tailRects.map((r, i) => (
                  <View
                    key={`t${i}`}
                    style={{ position: 'absolute', backgroundColor: color, opacity: PARTIAL_OPACITY, ...r }}
                  />
                ))}
                {coords.map((c, i) => {
                  const r = i === n - 1 ? DOT_R_LAST : DOT_R;
                  return (
                    <View
                      key={`d${i}`}
                      style={{
                        position: 'absolute',
                        left: c.x - r,
                        top: c.y - r,
                        width: r * 2,
                        height: r * 2,
                        borderRadius: r,
                        backgroundColor: color,
                        opacity: points[i].partial ? PARTIAL_OPACITY : 1,
                      }}
                    />
                  );
                })}
              </View>
              {/* Etiketler noktalarla HİZALI olmalı. Eskiden bu satır x=0'dan
                  başlayan bir flex row'du ve her etiket kendi `spacing` kutusunda
                  ortalanıyordu — yani etiket i'nin merkezi (i+0.5)*spacing'e
                  düşüyor, oysa nokta i xAt(i) konumunda. Sabit bir kayma vardı
                  (nokta 12 Tem'i gösterirken altında 11 Tem yazıyordu). Artık her
                  etiket mutlak konumla tam kendi noktasının üstüne ortalanıyor;
                  kutu genişliği LABEL_W_MAX ile sınırlı olduğu için aralık çok
                  açıldığında da etiket noktadan kopmuyor. Mutlak konum ayrıca
                  taşan uç etiketlerin ScrollView içerik genişliğini büyütmesini
                  engelliyor. */}
              <View style={{ width: plotW, height: LABEL_ROW_H }}>
                {points.map((p, i) => (
                  <Text
                    key={i}
                    style={{
                      position: 'absolute',
                      left: xAt(i) - labelW / 2,
                      width: labelW,
                      fontSize: LABEL_FONT,
                      // Satır yüksekliği kutuyla eşit — Android'de yazı tipi
                      // metrikleri LABEL_ROW_H'ı aşarsa etiket alttan kırpılıyor.
                      lineHeight: LABEL_ROW_H,
                      fontWeight: '600',
                      color: labelColor,
                      textAlign: 'center',
                    }}
                    numberOfLines={1}
                  >
                    {p.label}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
