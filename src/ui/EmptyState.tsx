// A characterful empty state for lists: a big line icon + title + (optional)
// subtitle. Replaces the plain "No X yet" text on all four tabs
// (Today/Tasks/Habits/Goals).

import { StyleSheet, Text, View } from 'react-native';
import { LineIcon, type LineIconId } from '@/ui/LineIcon';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from './theme';

interface Props {
  icon: LineIconId;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <LineIcon id={icon} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
    badge: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: { fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: {
      fontSize: 13,
      color: c.muted,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 19,
    },
  });
