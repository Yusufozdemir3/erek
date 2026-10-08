// The task icon set: errands and to-dos rather than the habit set's routines
// (water, sleep…). Stored by id in tasks.icon; drawn in the muted text color —
// tasks have no color of their own (the priority and tags already color a card).

import { Ionicons } from '@expo/vector-icons';
import type { HabitIconEntry } from '@/ui/habitIcons';

export const TASK_ICON_SET: HabitIconEntry[] = [
  { id: 'call', family: 'ionicons', name: 'call-outline', labelKey: 'taskIcon.call' },
  { id: 'message', family: 'ionicons', name: 'chatbubble-outline', labelKey: 'taskIcon.message' },
  { id: 'mail', family: 'ionicons', name: 'mail-outline', labelKey: 'taskIcon.mail' },
  { id: 'meeting', family: 'ionicons', name: 'people-outline', labelKey: 'taskIcon.meeting' },
  { id: 'work', family: 'ionicons', name: 'briefcase-outline', labelKey: 'taskIcon.work' },
  { id: 'computer', family: 'ionicons', name: 'laptop-outline', labelKey: 'taskIcon.computer' },
  { id: 'document', family: 'ionicons', name: 'document-text-outline', labelKey: 'taskIcon.document' },
  { id: 'idea', family: 'ionicons', name: 'bulb-outline', labelKey: 'taskIcon.idea' },
  { id: 'cart', family: 'ionicons', name: 'cart-outline', labelKey: 'taskIcon.cart' },
  { id: 'bill', family: 'ionicons', name: 'card-outline', labelKey: 'taskIcon.bill' },
  { id: 'package', family: 'ionicons', name: 'cube-outline', labelKey: 'taskIcon.package' },
  { id: 'gift', family: 'ionicons', name: 'gift-outline', labelKey: 'taskIcon.gift' },
  { id: 'home', family: 'ionicons', name: 'home-outline', labelKey: 'taskIcon.home' },
  { id: 'clean', family: 'ionicons', name: 'sparkles-outline', labelKey: 'taskIcon.clean' },
  { id: 'repair', family: 'ionicons', name: 'construct-outline', labelKey: 'taskIcon.repair' },
  { id: 'laundry', family: 'ionicons', name: 'shirt-outline', labelKey: 'taskIcon.laundry' },
  { id: 'cook', family: 'ionicons', name: 'restaurant-outline', labelKey: 'taskIcon.cook' },
  { id: 'car', family: 'ionicons', name: 'car-outline', labelKey: 'taskIcon.car' },
  { id: 'travel', family: 'ionicons', name: 'airplane-outline', labelKey: 'taskIcon.travel' },
  { id: 'doctor', family: 'ionicons', name: 'medkit-outline', labelKey: 'taskIcon.doctor' },
  { id: 'sport', family: 'ionicons', name: 'barbell-outline', labelKey: 'taskIcon.sport' },
  { id: 'study', family: 'ionicons', name: 'school-outline', labelKey: 'taskIcon.study' },
  { id: 'book', family: 'ionicons', name: 'book-outline', labelKey: 'taskIcon.book' },
  { id: 'event', family: 'ionicons', name: 'calendar-outline', labelKey: 'taskIcon.event' },
  { id: 'photo', family: 'ionicons', name: 'camera-outline', labelKey: 'taskIcon.photo' },
  { id: 'pet', family: 'ionicons', name: 'paw-outline', labelKey: 'taskIcon.pet' },
  { id: 'plant', family: 'ionicons', name: 'leaf-outline', labelKey: 'taskIcon.plant' },
  { id: 'love', family: 'ionicons', name: 'heart-outline', labelKey: 'taskIcon.love' },
  { id: 'flag', family: 'ionicons', name: 'flag-outline', labelKey: 'taskIcon.flag' },
  { id: 'star', family: 'ionicons', name: 'star-outline', labelKey: 'taskIcon.star' },
];

const BY_ID: Record<string, HabitIconEntry> = Object.fromEntries(TASK_ICON_SET.map((e) => [e.id, e]));

export function resolveTaskIcon(id: string | null | undefined): HabitIconEntry | undefined {
  return id ? BY_ID[id] : undefined;
}

// Unknown ids (a newer app version's icon) draw nothing rather than garbage.
export function TaskIconGlyph({ id, size = 18, color }: { id: string | null; size?: number; color: string }) {
  const entry = resolveTaskIcon(id);
  if (!entry) return null;
  return <Ionicons name={entry.name as keyof typeof Ionicons.glyphMap} size={size} color={color} />;
}
