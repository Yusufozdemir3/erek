// The habit icon set — line-vector icons (Feather/Ionicons), from the same
// icon language used in the bottom tab bar and EntityIcon (see EntityIcon.tsx).
// A habit's 'icon' field used to be a raw emoji character (colored, can't be
// tinted, inconsistent across devices); now it stores a SEMANTIC id defined
// here ('water', 'run'…) and is drawn as a single-color glyph tinted with the
// selected color.
//
// BACKWARD COMPATIBILITY: old records may still have a raw emoji in the
// 'icon' field (no id match). HabitIconGlyph keeps drawing such a value as
// Text (like the old emoji) — no data loss or forced migration.

import { Feather, Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';

export interface HabitIconEntry {
  id: string;
  family: 'feather' | 'ionicons';
  name: string;
  labelKey: string; // i18n key — for accessibility + (future) search
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

// Draws a habit's icon: a vector glyph (tinted with the selected color) if
// it's a known semantic id; raw text/emoji if not (legacy data); nothing if
// there's no value at all.
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
