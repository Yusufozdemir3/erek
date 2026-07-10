// İlk açılış tanıtımı (onboarding) — 3 sayfalık kaydırmalı tanıtım, yalnızca
// İLK açılışta gösterilir (bayrak AsyncStorage'da; uygulama silinince sıfırlanır).
// OnboardingGate kök layout'ta Stack'in yanında durur: bayrak yüklenene kadar
// hiçbir şey çizmez (açılışı geciktirmez), görülmemişse tam ekran Modal açar.
// "Atla" her sayfada, son sayfada "Başla"; ikisi de bayrağı yazar.

import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = 'onboarding:done';

const PAGES: { emoji: string; title: string; body: string }[] = [
  {
    emoji: '📅',
    title: 'Hepsi bir arada',
    body: 'Alışkanlıklar, görevler ve hedefler tek uygulamada. "Bugün" ekranı günün tamamını tek bakışta gösterir; alttaki ＋ ile her şeyi oradan eklersin.',
  },
  {
    emoji: '⏱️',
    title: 'Üç tip alışkanlık',
    body: 'Basit tik ("yaptım"), sayısal hedef (8 bardak su) ya da zamanlayıcı (20 dk meditasyon). Bir alışkanlığı hedefe bağla — tamamladığın her gün hedefe +1 yazılır.',
  },
  {
    emoji: '🔒',
    title: 'Verilerin sende',
    body: 'Her şey önce cihazında saklanır, internetsiz çalışır. İstersen Profil\'den hesap bağlayıp buluta yedekleyebilir, başka cihazlarla eşitleyebilirsin.',
  },
];

function Onboarding({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const last = page === PAGES.length - 1;

  const next = () => {
    if (last) onDone();
    else scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  };

  return (
    <Modal visible animationType="fade" onRequestClose={onDone}>
      <View style={styles.screen}>
        <Pressable
          style={styles.skip}
          onPress={onDone}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Tanıtımı atla"
        >
          <Text style={styles.skipText}>Atla</Text>
        </Pressable>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        >
          {PAGES.map((p) => (
            <View key={p.title} style={[styles.page, { width }]}>
              <Text style={styles.emoji}>{p.emoji}</Text>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.body}>{p.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
          <Pressable
            style={styles.nextBtn}
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Başla' : 'İleri'}
          >
            <Text style={styles.nextText}>{last ? 'Başla' : 'İleri'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Kök layout'a konan kapı: bayrağı okur, görülmemişse tanıtımı gösterir.
export function OnboardingGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = henüz bilinmiyor

  useEffect(() => {
    AsyncStorage.getItem(SEEN_KEY).then((v) => setSeen(v === '1'));
  }, []);

  if (seen !== false) return null;
  return (
    <Onboarding
      onDone={() => {
        setSeen(true);
        AsyncStorage.setItem(SEEN_KEY, '1').catch(() => {});
      }}
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    skip: { position: 'absolute', top: 56, right: 24, zIndex: 1 },
    skipText: { fontSize: 15, fontWeight: '600', color: c.muted },
    page: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      paddingBottom: 40,
    },
    emoji: { fontSize: 64, marginBottom: 24 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
    body: {
      fontSize: 15,
      color: c.muted,
      lineHeight: 23,
      textAlign: 'center',
      marginTop: 14,
    },
    footer: { paddingHorizontal: 24, paddingBottom: 48, gap: 20 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
    dotOn: { backgroundColor: c.primary, width: 20 },
    nextBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 15,
    },
    nextText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  });
