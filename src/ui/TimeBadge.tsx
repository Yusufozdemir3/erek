// Shows the task time as a small badge on the RIGHT of the card, just before
// the priority mark. Used on both the "Today" and "Tasks" screens, for tasks
// that have a time.
// It used to sit on the far LEFT, in front of the checkbox — only on timed
// tasks, so their checkbox and title were pushed right and no longer lined up
// with the untimed cards below. On the right, every card's checkbox and title
// start at the same x, and since timed tasks sort first, the times form a
// tidy column of their own.

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
    // End time: a fainter second line below the start time.
    end: { fontSize: 10, fontWeight: '600', color: c.primary, opacity: 0.7, marginTop: 1 },
  });
