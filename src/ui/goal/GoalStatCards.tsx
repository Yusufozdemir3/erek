// Hedef İstatistik sekmesinin küçük sunum bileşenleri — app/goal/[id].tsx'ten
// AYRILDI. Hiçbiri durum tutmaz, veri okumaz; yalnız verilen prop'u çizer.
// `styles` prop'u ekranın stil fabrikasından gelir (bkz. goalStyles.ts) —
// bileşenler kendi StyleSheet'ini üretmez ki tema/ölçü tek yerden yönetilsin.

import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { DEFAULT_HABIT_COLOR } from '@/ui/theme';
import type { LinkedHabit } from '@/ui/useGoalStats';
import type { GoalStyles } from '@/ui/goal/goalStyles';

export function StatGroupTitle({ label, styles }: { label: string; styles: GoalStyles }) {
  return <Text style={styles.groupTitle}>{label}</Text>;
}

export function StatCard({
  label,
  value,
  accent,
  styles,
}: {
  label: string;
  value: string;
  accent?: 'danger' | 'primary';
  styles: GoalStyles;
}) {
  return (
    <View style={styles.statCard}>
      <Text
        style={[
          styles.statValue,
          accent === 'danger' && styles.statValueDanger,
          accent === 'primary' && styles.statValuePrimary,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function LinkedHabitRow({ habit, styles }: { habit: LinkedHabit; styles: GoalStyles }) {
  const color = habit.color ?? DEFAULT_HABIT_COLOR;
  return (
    <Pressable
      style={styles.habitRow}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      accessibilityRole="button"
    >
      <View style={[styles.habitDot, { backgroundColor: color + '22', borderColor: color }]}>
        {habit.icon ? <HabitIconGlyph id={habit.icon} size={14} color={color} /> : null}
      </View>
      <Text style={styles.habitTitle} numberOfLines={1}>
        {habit.title}
      </Text>
      <Text style={styles.habitChevron}>›</Text>
    </Pressable>
  );
}
