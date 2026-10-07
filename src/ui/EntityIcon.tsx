// The task / habit / goal type icons, the same line icons as the tab bar (＋
// menu, Today's summary). Separate from the icon a user picks for a habit.

import { Feather, Ionicons } from '@expo/vector-icons';

export type EntityType = 'task' | 'habit' | 'goal' | 'voice';

export function EntityIcon({
  type,
  size = 22,
  color,
}: {
  type: EntityType;
  size?: number;
  color: string;
}) {
  if (type === 'habit') return <Ionicons name="flame" size={size} color={color} />;
  if (type === 'voice') return <Feather name="mic" size={size} color={color} />;
  if (type === 'goal') return <Feather name="target" size={size} color={color} />;
  return <Feather name="check-square" size={size} color={color} />;
}
