// "Share with friends" card on the owner's goal screen: the friend sees the
// goal and, on a numeric goal, can add progress of their own (see
// src/sync/sharedGoals.ts). Their entries reach this device through the normal
// sync pull and show up in the entry history with their name.

import type { Goal } from '@/db';
import { listGoalShares, shareGoal, unshareGoal } from '@/sync';
import { useI18n } from '@/i18n/I18nProvider';
import { ShareWithFriendsSection } from '@/ui/ShareWithFriendsSection';

export function GoalShareSection({ goal }: { goal: Goal }) {
  const { t } = useI18n();
  return (
    <ShareWithFriendsSection
      entityId={goal.id}
      hint={t(goal.goal_type === 'numeric' ? 'share.goalHint' : 'share.goalHintReadOnly')}
      listShares={listGoalShares}
      share={shareGoal}
      unshare={unshareGoal}
      notSyncedCode="ERK_GOAL_NOT_SYNCED"
    />
  );
}
