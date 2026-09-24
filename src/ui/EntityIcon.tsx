// Task/Habit/Goal "type" icon — uses the EXACT SAME line-icon set as the
// bottom tab bar (Feather check-square / Ionicons flame / Feather target) so
// these three types' visual identity stays consistent everywhere in the app.
// Used by: the ＋ menu (AddSheet, AddFab), the Today summary bar (DailySummary).
// The emoji icon a habit picks for itself (HabitEditModal) is SEPARATE from
// this — that's user customization, not a type identity.

import { Feather, Ionicons } from '@expo/vector-icons';

export type EntityType = 'task' | 'habit' | 'goal';

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
  if (type === 'goal') return <Feather name="target" size={size} color={color} />;
  return <Feather name="check-square" size={size} color={color} />;
}
