// Today's "your week is ready" card — only on Sunday and Monday, only once the
// review has something to show, and gone for the rest of the week once it was
// opened or dismissed (the week is remembered by its Monday, on the phone only).

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { isReviewDay, reviewWeekKey } from '@/lib/weeklyReview';
import { useTheme } from '@/ui/ThemeProvider';
import { percentLabel, type Colors } from '@/ui/theme';

export const REVIEW_DISMISSED_KEY = 'review:dismissedWeek';

interface Props {
  today: string;
  // The week's rate and its change (points) from the week before; null = the
  // review has nothing to show yet.
  preview: { rate: number; delta: number | null } | null;
}

// "78% · 12 points up from the week before" — the card says how the week went
// before it is even opened.
export function previewText(
  preview: { rate: number; delta: number | null },
  t: (key: string, params?: Record<string, string | number>) => string,
  percent: (n: number) => string
): string {
  const { rate, delta } = preview;
  if (delta === null) return percent(rate);
  const change = delta === 0 ? t('review.deltaSame') : t(delta > 0 ? 'review.deltaUp' : 'review.deltaDown', { n: Math.abs(delta) });
  return `${percent(rate)} · ${change}`;
}

export function ReviewCard({ today, preview }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const week = reviewWeekKey(today);
  // null = not read yet: nothing shows before we know, so the card never flashes.
  const [dismissedWeek, setDismissedWeek] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(REVIEW_DISMISSED_KEY)
      .then((v) => alive && setDismissedWeek(v))
      .catch(() => alive && setDismissedWeek(null));
    return () => {
      alive = false;
    };
  }, []);

  if (!preview || !isReviewDay(today) || dismissedWeek === undefined || dismissedWeek === week) return null;

  const remember = () => {
    setDismissedWeek(week);
    AsyncStorage.setItem(REVIEW_DISMISSED_KEY, week).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.body}
        onPress={() => {
          remember();
          router.push('/review' as Href);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t('review.cardTitle')}. ${previewText(preview, t, (n) => percentLabel(n, lang))}`}
      >
        <Feather name="bar-chart-2" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('review.cardTitle')}</Text>
          <Text style={styles.text}>{previewText(preview, t, (n) => percentLabel(n, lang))}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.faint} />
      </Pressable>
      <Pressable onPress={remember} hitSlop={16} accessibilityRole="button" accessibilityLabel={t('review.cardDismiss')}>
        <Feather name="x" size={18} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
    },
    body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontSize: 15, fontWeight: '700', color: c.text },
    text: { fontSize: 13, color: c.muted, marginTop: 2 },
  });
