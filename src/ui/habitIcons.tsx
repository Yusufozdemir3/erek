// The habit icon set: line icons (Feather/Ionicons) stored by id ('water',
// 'run'…) and tinted with the habit's color. Older rows may hold a raw emoji;
// HabitIconGlyph still draws that as text.

import { Feather, Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';

export interface HabitIconEntry {
  id: string;
  family: 'feather' | 'ionicons';
  name: string;
  labelKey: string; // i18n key (accessibility)
}

export const HABIT_ICON_SET: HabitIconEntry[] = [
  { id: 'water', family: 'ionicons', name: 'water-outline', labelKey: 'habitIcon.water' },
  { id: 'run', family: 'ionicons', name: 'walk-outline', labelKey: 'habitIcon.run' },
  { id: 'cycle', family: 'ionicons', name: 'bicycle-outline', labelKey: 'habitIcon.cycle' },
  { id: 'strength', family: 'ionicons', name: 'barbell-outline', labelKey: 'habitIcon.strength' },
  { id: 'yoga', family: 'ionicons', name: 'body-outline', labelKey: 'habitIcon.yoga' },
  { id: 'meditate', family: 'ionicons', name: 'flower-outline', labelKey: 'habitIcon.meditate' },
  { id: 'sleep', family: 'ionicons', name: 'moon-outline', labelKey: 'habitIcon.sleep' },
  { id: 'sun', family: 'feather', name: 'sun', labelKey: 'habitIcon.sun' },
  { id: 'nutrition', family: 'ionicons', name: 'nutrition-outline', labelKey: 'habitIcon.nutrition' },
  { id: 'coffee', family: 'feather', name: 'coffee', labelKey: 'habitIcon.coffee' },
  { id: 'no-drink', family: 'ionicons', name: 'wine-outline', labelKey: 'habitIcon.noDrink' },
  { id: 'quit', family: 'ionicons', name: 'ban-outline', labelKey: 'habitIcon.quit' },
  { id: 'medication', family: 'ionicons', name: 'medkit-outline', labelKey: 'habitIcon.medication' },
  { id: 'book', family: 'feather', name: 'book-open', labelKey: 'habitIcon.book' },
  { id: 'study', family: 'ionicons', name: 'school-outline', labelKey: 'habitIcon.study' },
  { id: 'write', family: 'feather', name: 'edit-3', labelKey: 'habitIcon.write' },
  { id: 'journal', family: 'ionicons', name: 'journal-outline', labelKey: 'habitIcon.journal' },
  { id: 'focus', family: 'ionicons', name: 'bulb-outline', labelKey: 'habitIcon.focus' },
  { id: 'target', family: 'feather', name: 'target', labelKey: 'habitIcon.target' },
  { id: 'plant', family: 'ionicons', name: 'leaf-outline', labelKey: 'habitIcon.plant' },
  { id: 'prayer', family: 'ionicons', name: 'sparkles-outline', labelKey: 'habitIcon.prayer' },
  { id: 'music', family: 'feather', name: 'music', labelKey: 'habitIcon.music' },
  { id: 'art', family: 'ionicons', name: 'color-palette-outline', labelKey: 'habitIcon.art' },
  { id: 'home', family: 'ionicons', name: 'home-outline', labelKey: 'habitIcon.home' },
  { id: 'money', family: 'ionicons', name: 'wallet-outline', labelKey: 'habitIcon.money' },
  { id: 'work', family: 'feather', name: 'briefcase', labelKey: 'habitIcon.work' },
  { id: 'social', family: 'ionicons', name: 'people-outline', labelKey: 'habitIcon.social' },
  { id: 'pet', family: 'ionicons', name: 'paw-outline', labelKey: 'habitIcon.pet' },
  { id: 'heart', family: 'feather', name: 'heart', labelKey: 'habitIcon.heart' },
  { id: 'trophy', family: 'ionicons', name: 'trophy-outline', labelKey: 'habitIcon.trophy' },
];

const BY_ID: Record<string, HabitIconEntry> = Object.fromEntries(HABIT_ICON_SET.map((e) => [e.id, e]));

export function resolveHabitIcon(id: string | null | undefined): HabitIconEntry | undefined {
  return id ? BY_ID[id] : undefined;
}

interface GlyphProps {
  id: string | null;
  size?: number;
  color: string;
}

// A known id → tinted glyph; anything else (old emoji) → text; null → nothing.
export function HabitIconGlyph({ id, size = 18, color }: GlyphProps) {
  const entry = resolveHabitIcon(id);
  if (entry) {
    return entry.family === 'feather' ? (
      <Feather name={entry.name as any} size={size} color={color} />
    ) : (
      <Ionicons name={entry.name as any} size={size} color={color} />
    );
  }
  if (id) return <Text style={[styles.legacyEmoji, { fontSize: size }]}>{id}</Text>;
  return null;
}

const styles = StyleSheet.create({
  legacyEmoji: { textAlign: 'center' },
});
