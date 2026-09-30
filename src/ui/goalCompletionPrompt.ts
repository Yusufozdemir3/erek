// Shared by the "Today" and "Habits" screens: after a habit check-off/amount
// change pushes its linked goal to completion (see habitRepo.toggleLog /
// incrementAmount's GoalJustCompleted return), asks whether to unlink the
// habit from that goal — the user chose "ask, don't decide for me" over
// auto-unlinking silently.

import { Alert } from 'react-native';
import { habitRepo, type GoalJustCompleted } from '@/db';

export function promptUnlinkGoalIfCompleted(
  habitId: string,
  result: GoalJustCompleted | null,
  t: (key: string, params?: Record<string, string | number>) => string,
  onUnlinked: () => void
): void {
  if (!result) return;
  Alert.alert(
    t('habit.goalCompletedTitle'),
    t('habit.goalCompletedBody', { goal: result.goalTitle }),
    [
      { text: t('habit.goalCompletedKeep'), style: 'cancel' },
      {
        text: t('habit.goalCompletedUnlink'),
        onPress: () => {
          habitRepo.update(habitId, { goal_id: null });
          onUnlinked();
        },
      },
    ]
  );
}
