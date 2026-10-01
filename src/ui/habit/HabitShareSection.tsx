// "Share with friends" card on the owner's habit stats screen: the friend sees
// the habit's full history, read-only (see src/sync/sharedHabits.ts).

import type { Habit } from '@/db';
import { listHabitShares, shareHabit, unshareHabit } from '@/sync';
import { useI18n } from '@/i18n/I18nProvider';
import { ShareWithFriendsSection } from '@/ui/ShareWithFriendsSection';

export function HabitShareSection({ habit }: { habit: Habit }) {
  const { t } = useI18n();
  return (
    <ShareWithFriendsSection
      entityId={habit.id}
      hint={t('share.habitHint')}
      listShares={listHabitShares}
      share={shareHabit}
      unshare={unshareHabit}
      notSyncedCode="ERK_HABIT_NOT_SYNCED"
    />
  );
}
