// Habit stats screen (tapping a card on the Habits tab). The page skeleton
// only; the body is ui/habit/HabitStatsBody.tsx, shared with a friend's habit.
// The pencil opens the same edit modal as the list's swipe.

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { useHabitStats } from '@/ui/useHabitStats';
import { useHabitCalendar } from '@/ui/useHabitCalendar';
import { HabitStatsBody } from '@/ui/habit/HabitStatsBody';
import { HabitShareSection } from '@/ui/habit/HabitShareSection';
import { RestDayButton } from '@/ui/habit/RestDayButton';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { refreshWidget } from '@/widget/widgetData';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeHabitStatsStyles } from '@/ui/habit/habitStatsStyles';

export default function HabitStatsScreen() {
  const { colors, shared } = useTheme();
  const { t } = useI18n();
  const styles = makeHabitStatsStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, notifyDataChanged } = useAppData();
  const [version, setVersion] = useState(0);
  const stats = useHabitStats(id, version);
  const calendar = useHabitCalendar(id, version);
  const habit = stats.habit;
  const [editing, setEditing] = useState<Habit | null>(null);

  const refresh = () => {
    setVersion((v) => v + 1);
    notifyDataChanged();
    refreshWidget(user.id);
  };
  const onEdited = () => {
    // Deleted from the modal: nothing left to show here.
    if (!habitRepo.getById(id)) {
      notifyDataChanged();
      router.back();
      return;
    }
    refresh();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={[shared.headerRow, styles.backRow]}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.backText}>{t('common.back')}</Text>
          </Pressable>
          {habit && (
            <Pressable
              onPress={() => setEditing(habitRepo.getById(habit.id))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.editA11y', { title: habit.title })}
            >
              <Feather name="edit-2" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {!habit ? (
          <Text style={shared.empty}>{t('stats.notFound')}</Text>
        ) : (
          <>
            <RestDayButton habit={habit} onChanged={refresh} />
            <HabitStatsBody stats={{ ...stats, habit }} calendar={calendar} />
            <HabitShareSection habit={habit} />
          </>
        )}
      </ScrollView>
      <HabitEditModal habit={editing} onClose={() => setEditing(null)} onChanged={onEdited} />
    </SafeAreaView>
  );
}
