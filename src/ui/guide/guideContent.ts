// The pages of each feature guide. Text comes from the i18n files:
// guide.<id>.<n>.title / .body (and .cta when a page has a button), where <n>
// is the page's 1-based position in the list below. A page's button closes the
// guide and opens `route` (when set).

import type { GuideId } from '@/lib/guides';
import type { LineIconId } from '@/ui/LineIcon';

export interface GuidePage {
  icon: LineIconId;
  cta?: { route?: string };
  // Pages that only make sense when signed in with Google (sharing).
  needsAccount?: boolean;
}

export const GUIDES: Record<GuideId, GuidePage[]> = {
  goals: [
    { icon: 'goal' },
    { icon: 'number' },
    { icon: 'add' },
    { icon: 'link', cta: { route: '/(tabs)/habits' } },
    { icon: 'trend' },
    { icon: 'people', needsAccount: true },
  ],
  habits: [
    { icon: 'sprout' },
    { icon: 'done' },
    { icon: 'calendar' },
    { icon: 'habit' },
    { icon: 'moon' },
    { icon: 'bell' },
    { icon: 'link', cta: { route: '/(tabs)/goals' } },
  ],
  friends: [
    { icon: 'people' },
    { icon: 'key' },
    { icon: 'upload' },
    { icon: 'download' },
    { icon: 'welcome' },
    { icon: 'lock' },
  ],
  tasks: [
    { icon: 'edit' },
    { icon: 'calendar' },
    { icon: 'task' },
    { icon: 'repeat' },
    { icon: 'tap' },
    { icon: 'bell' },
    { icon: 'mic' },
    { icon: 'people', needsAccount: true },
    { icon: 'tag' },
  ],
  today: [
    { icon: 'home' },
    { icon: 'done' },
    { icon: 'calendar' },
    { icon: 'search' },
    { icon: 'chart' },
    { icon: 'moon' },
    { icon: 'clock' },
  ],
  widgets: [
    { icon: 'puzzle' },
    { icon: 'done' },
    { icon: 'edit' },
    { icon: 'goal' },
    { icon: 'refresh' },
  ],
  notifications: [
    { icon: 'bell' },
    { icon: 'sound' },
    { icon: 'clock' },
    { icon: 'people', needsAccount: true },
  ],
};
