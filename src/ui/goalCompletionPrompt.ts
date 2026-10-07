// When a habit check-off completes its linked goal (GoalJustCompleted), ask
// whether to unlink the habit rather than deciding silently. Today and Habits.

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
