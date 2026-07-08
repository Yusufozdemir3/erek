// Görev saatini kartın en solunda küçük bir rozet olarak gösterir.
// Hem "Bugün" hem "Görevler" ekranında, saati olan görevlerde kullanılır.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from './theme';

export function TimeBadge({ time }: { time: string }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{time}</Text>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    badge: {
      minWidth: 44,
      paddingVertical: 4,
      paddingHorizontal: 6,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      marginRight: 10,
    },
    text: { fontSize: 12, fontWeight: '700', color: c.primary },
  });
