// Habit stats screen (from the Habits tab's 7-day strip). The page skeleton
// only; the body is ui/habit/HabitStatsBody.tsx, shared with a friend's habit.

import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useHabitStats } from '@/ui/useHabitStats';
import { useHabitCalendar } from '@/ui/useHabitCalendar';
import { HabitStatsBody } from '@/ui/habit/HabitStatsBody';
import { HabitShareSection } from '@/ui/habit/HabitShareSection';
import { RestDayButton } from '@/ui/habit/RestDayButton';
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

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!habit ? (
          <Text style={shared.empty}>{t('stats.notFound')}</Text>
        ) : (
          <>
            <RestDayButton
              habit={habit}
              onChanged={() => {
                setVersion((v) => v + 1);
                notifyDataChanged();
                refreshWidget(user.id);
              }}
            />
            <HabitStatsBody stats={{ ...stats, habit }} calendar={calendar} />
            <HabitShareSection habit={habit} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
