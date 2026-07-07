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
import { colors } from '@/ui/theme';

type AddStep = Exclude<Step, 'menu'>;

const OPTIONS: { step: AddStep; emoji: string; label: string; color: string }[] = [
  { step: 'goal', emoji: '🎯', label: 'Hedef', color: '#f59e0b' },
  { step: 'habit', emoji: '🔥', label: 'Alışkanlık', color: colors.streak },
  { step: 'task', emoji: '✅', label: 'Görev', color: colors.primary },
];

// Sekme çubuğundaki kare ＋ butonu. `open` iken ＋ 45° dönerek × olur.
export function AddFabButton({ open, onPress }: { open: boolean; onPress: () => void }) {
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
    <Pressable style={styles.buttonWrap} onPress={onPress} hitSlop={8}>
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
                <Text style={styles.optionLabel}>{opt.label}</Text>
              </Pressable>
              <Pressable
                style={[styles.optionCircle, { backgroundColor: opt.color }]}
                onPress={() => onPick(opt.step)}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // — Sekme çubuğundaki kare buton —
  buttonWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  square: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // Sekme çubuğunun üst çizgisini ortalayacak kadar yukarı taşar.
    marginTop: -26,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  // ＋ işaretini iki çubukla çiziyoruz; kutu 16×16, çubuklar tam ortada.
  plusBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  plusBarH: { position: 'absolute', width: 16, height: 2.5, borderRadius: 2, backgroundColor: '#fff' },
  plusBarV: { position: 'absolute', width: 2.5, height: 16, borderRadius: 2, backgroundColor: '#fff' },

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
  optionEmoji: { fontSize: 24 },
  labelBtn: {
    position: 'absolute',
    right: '50%',
    marginRight: 38, // dairenin yarısı (26) + boşluk (12)
    justifyContent: 'center',
  },
  optionLabel: {
    backgroundColor: '#fff',
    color: colors.text,
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
