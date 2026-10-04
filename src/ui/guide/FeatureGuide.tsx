// The guide card: a few short pages with dots, Back / Next, "Skip" and, on some
// pages, one button that jumps to the place the page talks about. Opens by
// itself the first time a new install visits a feature's screen
// (useFeatureGuide) and again from the screen's "?" button.

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useI18n } from '@/i18n/I18nProvider';
import type { GuideId } from '@/lib/guides';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';
import { GUIDES } from './guideContent';

interface Props {
  guide: GuideId;
  visible: boolean;
  // Closing by any route: Skip, Done, back button, or a page's button.
  onClose: () => void;
  // Whether sharing pages apply (signed in with Google).
  canShare?: boolean;
}

export function FeatureGuide({ guide, visible, onClose, canShare = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [index, setIndex] = useState(0);

  const all = GUIDES[guide];
  const pages = all.filter((p) => !p.needsAccount || canShare);
  if (!visible || pages.length === 0) return null;
  const i = Math.min(index, pages.length - 1);
  const page = pages[i];
  const last = i === pages.length - 1;
  const text = (part: string) => t(`guide.${guide}.${all.indexOf(page) + 1}.${part}`);

  const close = () => {
    setIndex(0);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.emoji}>{page.emoji}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {text('title')}
          </Text>
          <Text style={styles.body}>{text('body')}</Text>

          {page.cta && (
            <Pressable
              style={styles.cta}
              onPress={() => {
                const route = page.cta?.route;
                close();
                if (route) router.push(route as Href);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{text('cta')}</Text>
            </Pressable>
          )}

          <View style={styles.dots} accessibilityLabel={t('guide.pageOf', { n: i + 1, total: pages.length })}>
            {pages.map((_, n) => (
              <View key={n} style={[styles.dot, n === i && styles.dotOn]} />
            ))}
          </View>

          <View style={styles.nav}>
            {last ? (
              <View />
            ) : (
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
                <Text style={styles.skip}>{t('guide.skip')}</Text>
              </Pressable>
            )}
            <View style={styles.navRight}>
              {i > 0 && (
                <Pressable onPress={() => setIndex(i - 1)} hitSlop={10} accessibilityRole="button">
                  <Text style={styles.back}>{t('common.back')}</Text>
                </Pressable>
              )}
              <Pressable
                style={styles.next}
                onPress={() => (last ? close() : setIndex(i + 1))}
                accessibilityRole="button"
              >
                <Text style={styles.nextText}>{last ? t('common.done') : t('common.next')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    card: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 440,
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 22,
      gap: 10,
    },
    emoji: { fontSize: 40, textAlign: 'center' },
    title: { fontSize: 19, fontWeight: '800', color: c.text, textAlign: 'center' },
    body: { fontSize: 15, lineHeight: 22, color: c.muted, textAlign: 'center' },
    cta: {
      alignSelf: 'center',
      marginTop: 4,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
    },
    ctaText: { fontSize: 14, fontWeight: '700', color: c.primary },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
    dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.border },
    dotOn: { backgroundColor: c.primary, width: 18 },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    navRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    skip: { fontSize: 14, color: c.faint, paddingVertical: 8 },
    back: { fontSize: 14, color: c.muted, paddingVertical: 8 },
    next: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: c.primary },
    nextText: { fontSize: 14, fontWeight: '700', color: c.onAccent },
  });
