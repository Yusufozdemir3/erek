// A task's time on the right of its card, before the priority mark — keeping
// every card's checkbox and title aligned, with the times in a column.

import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from './theme';

export function TimeBadge({ time, endTime }: { time: string; endTime?: string | null }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{time}</Text>
      {endTime ? <Text style={styles.end}>{endTime}</Text> : null}
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
      marginLeft: 10,
      marginRight: 10,
    },
    text: { fontSize: 12, fontWeight: '700', color: c.primary },
    // The end time, fainter, below.
    end: { fontSize: 10, fontWeight: '600', color: c.primary, opacity: 0.7, marginTop: 1 },
  });
