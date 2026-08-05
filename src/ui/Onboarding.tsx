// İlk açılış tanıtımı (onboarding) — 4 sayfalık kaydırmalı tanıtım, yalnızca
// İLK açılışta gösterilir (bayrak AsyncStorage'da; uygulama silinince sıfırlanır).
// OnboardingGate kök layout'ta Stack'in yanında durur: bayrak yüklenene kadar
// hiçbir şey çizmez (açılışı geciktirmez), görülmemişse tam ekran Modal açar.
// "Atla" her sayfada, son sayfada "Başla"; ikisi de bayrağı yazar.
//
// GÖRSEL DİL: rengi TEK kaynaktan alır — colors.primary/primarySoft (kullanıcının
// Profil'den seçtiği vurgu rengi). Sayfa başına farklı renk YOK bilerek: theme.ts
// uygulamanın tek-vurgu, tutarlı "editorial" kimliğini özellikle savunuyor (bkz.
// ACCENT_THEMES yorumu) — onboarding'i renk renk bir tanıtım şeridine çevirmek o
// kimlikle çelişirdi. İkon rozeti + arka plan gradyanı AddSheet'teki soluk-zeminli
// ikon kutusuyla aynı dilde ("premium" his, yeni bir görsel motif icat etmeden).

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
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

const SEEN_KEY = 'onboarding:done';

// Metinler i18n anahtarı; render'da t() ile çevrilir. Sıra bilinçli: önce ürünün
// çekirdeği (hepsi bir arada), sonra esnekliği (üç takip tipi + seri/puan), sonra
// ayırt edici bir özellik (ana ekran widget'ı — eskiden hiçbir yerde anlatılmıyordu),
// son olarak güven (veri kontrolü). "Neden bu uygulama" sorusuna giderek yaklaşan
// bir sıra; kapanış hep güven notunda kalsın diye "Verilerin sende" son sayfada.
const PAGES: { emoji: string; titleKey: string; bodyKey: string }[] = [
  { emoji: '📅', titleKey: 'onboarding.page1Title', bodyKey: 'onboarding.page1Body' },
  { emoji: '🔥', titleKey: 'onboarding.page2Title', bodyKey: 'onboarding.page2Body' },
  { emoji: '🏠', titleKey: 'onboarding.page3Title', bodyKey: 'onboarding.page3Body' },
  { emoji: '🔒', titleKey: 'onboarding.page4Title', bodyKey: 'onboarding.page4Body' },
];

function Onboarding({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
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
      {/* Vurgu renginin soluk tonundan zemine inen ince bir gradyan — düz renkten
          daha canlı ama tema/vurgu rengi ne olursa olsun kendiliğinden uyar
          (sabit bir renk yazılsaydı kullanıcının seçtiği vurgu/karanlık temayla
          çatışabilirdi). locations ekranın alt yarısını düz zemine bırakır ki
          metin ve düğme her zaman okunaklı kalsın. */}
      <LinearGradient
        colors={[colors.primarySoft, colors.bg]}
        locations={[0, 0.6]}
        style={styles.screen}
      >
        <Pressable
          style={styles.skip}
          onPress={onDone}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skipA11y')}
        >
          <Text style={styles.skipText}>{t('onboarding.skip')}</Text>
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
            <View key={p.titleKey} style={[styles.page, { width }]}>
              <View style={styles.iconBadge}>
                <Text style={styles.emoji}>{p.emoji}</Text>
              </View>
              <Text style={styles.title}>{t(p.titleKey)}</Text>
              <Text style={styles.body}>{t(p.bodyKey)}</Text>
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
            accessibilityLabel={last ? t('onboarding.start') : t('onboarding.next')}
          >
            <Text style={styles.nextText}>{last ? t('onboarding.start') : t('onboarding.next')}</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
}

// — SIRA: TANITIM ÖNCE, GİRİŞ SONRA —
// Giriş kapısı (LoginGate) da kök layout'ta bağımsız bir Modal açıyor. İkisi
// arasında hiçbir sıralama yoktu ve gerçek ilk açılışta ikisi aynı anda mount
// olup giriş ekranı tanıtımın üstüne biniyordu. LoginGate artık bu bayrağa
// bakıyor; tanıtım kapanır kapanmaz haberi olsun diye küçük bir bildirim var
// (AsyncStorage'ı yoklamak yerine — bayrak zaten bu süreçte yazılıyor).
export const ONBOARDING_SEEN_KEY = SEEN_KEY;

type Listener = () => void;
const doneListeners = new Set<Listener>();

/** Tanıtım tamamlandığında (ya da atlandığında) haber verir; abonelikten çıkarır. */
export function onOnboardingDone(fn: Listener): () => void {
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
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
        for (const fn of doneListeners) fn();
      }}
    />
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // backgroundColor artık LinearGradient'te — screen yalnız flex:1 verir.
    screen: { flex: 1 },
    skip: { position: 'absolute', top: 56, right: 24, zIndex: 1 },
    skipText: { fontSize: 15, fontWeight: '600', color: c.muted },
    page: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      paddingBottom: 40,
    },
    // AddSheet'teki soluk-zeminli ikon kutusuyla aynı dil (optionIcon) — büyük
    // emoji artık boşlukta asılı durmak yerine bir kimliğe/çerçeveye oturuyor.
    iconBadge: {
      width: 128,
      height: 128,
      borderRadius: 64,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
    },
    emoji: { fontSize: 56 },
    title: { fontSize: 28, fontWeight: '800', color: c.text, textAlign: 'center' },
    body: {
      fontSize: 15,
      color: c.muted,
      lineHeight: 24,
      textAlign: 'center',
      marginTop: 14,
      maxWidth: 320,
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
      // Hafif kaldırma — düğme artık düz zemin değil gradyan üstünde, ince bir
      // gölge onu zeminden ayırır (iOS: shadow*, Android: elevation).
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 4,
    },
    nextText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  });
