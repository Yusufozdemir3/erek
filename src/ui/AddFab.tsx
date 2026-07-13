// Merkezi ＋ hızlı ekleme butonu (speed-dial).
// ＋ kare bir butondur; dokununca 45° dönerek ×'e döner ve üç seçenek
// (Görev · Alışkanlık · Hedef) yaylanarak (swing) yukarı açılır. Bir seçenek
// seçilince ilgili tür doğrudan AddSheet formunda açılır.
//
// İki parça birlikte, aynı `open` durumuyla sürülür:
//   • AddFabButton — sekme çubuğunun ortasındaki kare buton (dönen ＋).
//   • AddFab       — tüm ekranı kaplayan overlay (arka fon + yaylanan seçenekler).
// Overlay, sekme çubuğuna sığmayacağı için _layout'ta Tabs'ın kardeşi olarak
// (üstünde) çizilir.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@/ui/AddSheet';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import type { Colors } from '@/ui/theme';

type AddStep = Exclude<Step, 'menu'>;

// Seçenek daireleri sabit vurgu renkleri (iki modda da okunur). İkon: tab
// bar'daki aynı çizgi ikon seti (EntityIcon); etiket i18n anahtarı (AddSheet
// menüsüyle aynı 'add.*' anahtarları — tek kaynak, tutarlı metin).
const OPTIONS: { step: AddStep; type: EntityType; labelKey: string; color: string }[] = [
  { step: 'goal', type: 'goal', labelKey: 'add.goal', color: '#f59e0b' },
  { step: 'habit', type: 'habit', labelKey: 'add.habit', color: '#f97316' },
  { step: 'task', type: 'task', labelKey: 'add.task', color: '#6366f1' },
];

// Sekme çubuğundaki kare ＋ butonu. `open` iken ＋ 45° dönerek × olur.
export function AddFabButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 90,
    }).start();
  }, [open, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <Pressable
      style={styles.buttonWrap}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Ekleme menüsünü kapat' : 'Ekle'}
      accessibilityState={{ expanded: open }}
    >
      {/* Kare çerçevenin tamamı döner; içindeki ＋ de onunla dönüp × olur.
          ＋ iki çubukla çizilir → font metriğinden bağımsız, tam ortalı. */}
      <Animated.View style={[styles.square, { transform: [{ rotate }] }]}>
        <View style={styles.plusBox}>
          <View style={styles.plusBarH} />
          <View style={styles.plusBarV} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

// Tüm ekranı kaplayan overlay: arka fon + yaylanarak açılan seçenekler.
export function AddFab({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (step: AddStep) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // Her seçenek için ayrı animasyon değeri (stagger'lı yay girişi) + arka fon.
  const anims = useRef(OPTIONS.map(() => new Animated.Value(0))).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Kapanış animasyonu bitene kadar ağaçta kalması için ayrı mount durumu.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(backdrop, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      Animated.stagger(
        55,
        anims.map((a) =>
          Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 5, tension: 75 })
        )
      ).start();
    } else {
      Animated.timing(backdrop, { toValue: 0, duration: 130, useNativeDriver: true }).start();
      Animated.stagger(
        25,
        [...anims].reverse().map((a) =>
          Animated.timing(a, { toValue: 0, duration: 120, useNativeDriver: true })
        )
      ).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, anims, backdrop]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdrop }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={styles.fan} pointerEvents="box-none">
        {OPTIONS.map((opt, i) => {
          const a = anims[i];
          // Yaylanma: aşağıdan yukarı süzülüp hafif dönerek "swing" ile gelir.
          const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [56, 0] });
          const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
          const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] });
          return (
            <Animated.View
              key={opt.step}
              style={[styles.optionRow, { opacity: a, transform: [{ translateY }, { rotate }, { scale }] }]}
              pointerEvents="box-none"
            >
              <Pressable style={styles.labelBtn} onPress={() => onPick(opt.step)} hitSlop={6}>
                <Text style={styles.optionLabel}>{t(opt.labelKey)}</Text>
              </Pressable>
              <Pressable
                style={[styles.optionCircle, { backgroundColor: opt.color }]}
                onPress={() => onPick(opt.step)}
              >
                <EntityIcon type={opt.type} size={22} color="#ffffff" />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // — Sekme çubuğundaki kare buton —
    // Üste hizala (flex-start) + kendi yarısı (18) kadar yukarı taşı: böylece
    // karenin dikey merkezi, çubuk yüksekliğinden BAĞIMSIZ olarak tam üst
    // çizgiye oturur. 45° dönünce yan köşeler çizgiye denk gelir.
    buttonWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    square: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      // Karenin merkezini çubuğun üst çizgisine ortalar (yarı yukarı = -18).
      marginTop: -18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    // ＋ işaretini iki çubukla çiziyoruz; kutu 16×16, çubuklar tam ortada.
    plusBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    plusBarH: { position: 'absolute', width: 16, height: 2.5, borderRadius: 2, backgroundColor: c.onAccent },
    plusBarV: { position: 'absolute', width: 2.5, height: 16, borderRadius: 2, backgroundColor: c.onAccent },

    // — Açılan overlay —
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)' },
    fan: {
      // Seçenekler sekme çubuğunun hemen üstünde, ortalanmış olarak dizilir.
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 96,
      alignItems: 'center',
    },
    optionRow: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    // Daire tam ortada; etiket, dairenin soluna mutlak konumla yerleşir.
    optionCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    labelBtn: {
      position: 'absolute',
      right: '50%',
      marginRight: 38, // dairenin yarısı (26) + boşluk (12)
      justifyContent: 'center',
    },
    optionLabel: {
      backgroundColor: c.card,
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
  });
