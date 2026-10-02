// Streak indicator for habit cards: a flame line-icon + the count, or — once a
// milestone is reached — the milestone medal in the flame's place (medals are
// rewards, so they stay emoji; see lib/milestones).

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { highestMilestone } from '@/lib/milestones';
import { useTheme } from '@/ui/ThemeProvider';

// `medalDays`: the day count the medal threshold is judged against — differs
// from `streak` for weekly-quota habits (streak counts weeks).
export function StreakBadge({ streak, medalDays = streak }: { streak: number; medalDays?: number }) {
  const { colors } = useTheme();
  const medal = highestMilestone(medalDays);
  return (
    <View style={styles.row} accessibilityLabel={String(streak)}>
      {medal ? (
        <Text style={styles.medal}>{medal.emoji}</Text>
      ) : (
        <Ionicons name="flame" size={16} color={colors.streak} />
      )}
      <Text style={[styles.count, { color: colors.streak }]}>{streak}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  medal: { fontSize: 15 },
  count: { fontSize: 14, fontWeight: '700' },
});
