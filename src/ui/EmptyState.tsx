// A characterful empty state for lists: a big emoji + title + (optional)
// subtitle. Replaces the plain "No X yet" text on all four tabs
// (Today/Tasks/Habits/Goals).

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from './theme';

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
}

export function EmptyState({ emoji, title, subtitle }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
    emoji: { fontSize: 46, marginBottom: 14 },
    title: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 19,
    },
  });
