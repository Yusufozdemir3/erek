// The pages of each feature guide. Text comes from the i18n files:
// guide.<id>.<n>.title / .body (and .cta when a page has a button), where <n>
// is the page's 1-based position in the list below. A page's button closes the
// guide and opens `route` (when set).

import type { GuideId } from '@/lib/guides';

export interface GuidePage {
  emoji: string;
  cta?: { route?: string };
  // Pages that only make sense when signed in with Google (sharing).
  needsAccount?: boolean;
}

export const GUIDES: Record<GuideId, GuidePage[]> = {
  goals: [
    { emoji: '🎯' },
    { emoji: '🔢' },
    { emoji: '➕' },
    { emoji: '🔗', cta: { route: '/(tabs)/habits' } },
    { emoji: '📈' },
    { emoji: '👥', needsAccount: true },
  ],
  habits: [
    { emoji: '🌱' },
    { emoji: '✅' },
    { emoji: '📅' },
    { emoji: '🔥' },
    { emoji: '😴' },
    { emoji: '🔔' },
    { emoji: '🔗', cta: { route: '/(tabs)/goals' } },
  ],
  friends: [
    { emoji: '👥' },
    { emoji: '🔑' },
    { emoji: '📤' },
    { emoji: '📥' },
    { emoji: '👋' },
    { emoji: '🔒' },
  ],
};
