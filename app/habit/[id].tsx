// Habit stats screen (tapping a card on the Habits tab). The page skeleton
// only; the body is ui/habit/HabitStatsBody.tsx, shared with a friend's habit.
// The pencil opens the same edit modal as the list's swipe.

import { useRef, useState } from 'react';
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
import { HabitGroupSection } from '@/ui/habit/HabitGroupSection';
import { useHabitGroups } from '@/ui/useHabitGroups';
import { groupOfHabit } from '@/lib/habitGroup';
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
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrolledToGroup = useRef(false);
  const { user, notifyDataChanged } = useAppData();
  const [version, setVersion] = useState(0);
  const stats = useHabitStats(id, version);
  const calendar = useHabitCalendar(id, version);
  const habit = stats.habit;
  const [editing, setEditing] = useState<Habit | null>(null);
  // A copy we joined can't be shared on (only its founder's habit can).
  const { groups } = useHabitGroups();
  const joinedCopy = !!groupOfHabit(groups, id)?.members.some((m) => m.isMe && !m.isOwner);

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
      <ScrollView ref={scrollRef} contentContainerStyle={shared.content}>
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
            <View
              onLayout={(e) => {
                // Opened from a shared habit's members on Today: jump to the group section once.
                const { y, height } = e.nativeEvent.layout;
                if (section === 'group' && height > 0 && !scrolledToGroup.current) {
                  scrolledToGroup.current = true;
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
                }
              }}
            >
              <HabitGroupSection habit={habit} />
            </View>
            {!joinedCopy && <HabitShareSection habit={habit} />}
          </>
        )}
      </ScrollView>
      <HabitEditModal habit={editing} onClose={() => setEditing(null)} onChanged={onEdited} />
    </SafeAreaView>
  );
}
