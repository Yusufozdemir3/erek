// "Who added what" strip of a shared goal: one stacked bar plus a line per
// person. Shown only when two or more people have contributed (see
// lib/goalContributions.ts: fixed order, no ranking).

import { StyleSheet, Text, View } from 'react-native';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/ui/ThemeProvider';
import { HABIT_COLORS, percentLabel, type Colors } from '@/ui/theme';
import type { Contribution } from '@/lib/goalContributions';

interface Props {
  shares: Contribution[];
  unit: string | null;
  nameOf: (key: string) => string;
}

export function GoalContributors({ shares, unit, nameOf }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  if (shares.length < 2) return null;
  const color = (i: number) => HABIT_COLORS[i % HABIT_COLORS.length];
  return (
    <View style={styles.card} accessibilityLabel={t('goal.contributorsTitle')}>
      <Text style={styles.title}>{t('goal.contributorsTitle')}</Text>
      <View style={styles.bar}>
        {shares.map((s, i) => (
          <View key={s.key} style={{ flex: Math.max(s.amount, 0.0001), backgroundColor: color(i) }} />
        ))}
      </View>
      {shares.map((s, i) => (
        <View key={s.key} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: color(i) }]} />
          <Text style={styles.name} numberOfLines={1}>
            {nameOf(s.key)}
          </Text>
          <Text style={styles.value}>
            {percentLabel(s.share, lang)} · {fmtGoalValue(s.amount, unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: { marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, gap: 8 },
    title: { fontSize: 13, fontWeight: '700', color: c.muted },
    bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: c.track },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    name: { flex: 1, fontSize: 14, color: c.text },
    value: { fontSize: 13, color: c.muted },
  });
