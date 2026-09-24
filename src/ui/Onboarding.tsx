// First-launch onboarding — a 4-page swipeable intro, shown only on the FIRST
// launch (flag lives in AsyncStorage; resets if the app is uninstalled).
// OnboardingGate sits next to the Stack in the root layout: renders nothing until
// the flag loads (doesn't delay startup), and opens a full-screen Modal if unseen.
// "Skip" appears on every page, "Start" on the last one; both write the flag.
//
// VISUAL LANGUAGE: color comes from a SINGLE source — colors.primary/primarySoft
// (the accent color the user picked in Profile). Deliberately NO per-page color:
// theme.ts specifically champions the app's single-accent, consistent "editorial"
// identity (see the ACCENT_THEMES comment) — turning onboarding into a
// multicolored promo reel would contradict that identity. The icon badge +
// background gradient use the same language as AddSheet's faint-background icon
// box ("premium" feel, without inventing a new visual motif).

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

// Texts are i18n keys; translated with t() at render time. The order is
// deliberate: first the product's core (everything in one place), then its
// flexibility (three tracking types + streaks/score), then a differentiating
// feature (the home screen widget — previously never explained anywhere), and
// finally trust (data control). An order that progressively answers "why this
// app"; "your data stays with you" is last so the close always lands on the
// trust note.
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
      {/* A subtle gradient from the accent color's soft tone down to the background —
          more lively than a flat color, but it auto-adapts no matter what the
          theme/accent color is (a hardcoded color could clash with the user's
          chosen accent or a dark theme). `locations` leaves the bottom half of the
          screen flat so text and the button always stay readable. */}
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

// — ORDER: ONBOARDING FIRST, LOGIN SECOND —
// The login gate (LoginGate) also opens an independent Modal in the root layout.
// There used to be no ordering between the two, and on a real first launch both
// mounted at the same time, with the login screen ending up on top of onboarding.
// LoginGate now watches this flag; there's a small notification so it hears about
// it the instant onboarding closes (instead of polling AsyncStorage — the flag is
// already being written in this same process).
export const ONBOARDING_SEEN_KEY = SEEN_KEY;

type Listener = () => void;
const doneListeners = new Set<Listener>();

/** Notifies when onboarding completes (or is skipped); returns an unsubscribe function. */
export function onOnboardingDone(fn: Listener): () => void {
  doneListeners.add(fn);
  return () => doneListeners.delete(fn);
}

// Gate placed on the root layout: reads the flag, shows onboarding if unseen.
export function OnboardingGate() {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not known yet

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
    // backgroundColor now lives on the LinearGradient — screen only sets flex:1.
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
    // Same language as AddSheet's faint-background icon box (optionIcon) — the
    // big emoji now sits within an identity/frame instead of floating in space.
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
      // A slight lift — the button now sits on a gradient instead of a flat
      // background, so a subtle shadow separates it from the surface (iOS:
      // shadow*, Android: elevation).
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 4,
    },
    nextText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  });
