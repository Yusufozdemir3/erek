// "Habits" tab — all habits, today's check mark, streak, and the last 7 days'
// history. Tapping the box checks off/undoes today.
// No adding here: that happens from the ＋ menu in the tab bar.
// Architecture rule: no SQL; only habitRepo is called.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { cancelHabitReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { useHabitsData, type HabitListItem } from '@/ui/useHabitsData';
import { EmptyState } from '@/ui/EmptyState';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { ProfileButton } from '@/ui/ProfileButton';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { type Colors } from '@/ui/theme';

export default function HabitsScreen() {
  const { colors, shared } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const [editing, setEditing] = useState<Habit | null>(null); // null = panel closed
  // Only one card's swipe actions may be open at a time.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const { today, habits, reload } = useHabitsData(user.id);

  const toggleToday = (h: HabitListItem) => {
    const completing = !h.completedToday;
    habitRepo.toggleLog(h.id, today, completing);
    completing ? notifySuccess() : tapLight();
    reload();
  };

  const adjustToday = (h: HabitListItem, delta: number) => {
    habitRepo.incrementAmount(h.id, today, delta, h.target);
    tapLight();
    reload();
  };

  const setTodayAmount = (h: HabitListItem, value: number) => {
    habitRepo.incrementAmount(h.id, today, value - h.amount, h.target);
    reload();
  };

  const openEdit = (h: HabitListItem) => {
    setEditing(habitRepo.getById(h.id));
  };

  const removeHabit = (h: HabitListItem) => {
    // habitRepo.softDelete cleans up the reminder ROWS; what's cancelled here
    // is the trigger sitting in the OS's notification queue. cancelByPrefix
    // reads the native list, so it can reject — if not caught this becomes an
    // "unhandled rejection".
    habitRepo.softDelete(h.id);
    cancelHabitReminders(h.id).catch((e) =>
      console.warn('[Notification] Failed to cancel reminders for deleted habit:', e)
    );
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{t('tabs.habits')}</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>{t('screen.habitsSubtitle')}</Text>

        {habits.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title={t('empty.habitsTitle')}
            subtitle={t('empty.habitsBody')}
          />
        ) : (
          habits.map((h, i) => (
            <View key={h.id} style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}>
            <SwipeableRow
              isOpen={openRowId === h.id}
              onOpenChange={(open) => setOpenRowId(open ? h.id : null)}
              onEdit={() => openEdit(h)}
              onDelete={() => removeHabit(h)}
              editA11yLabel={t('common.editA11y', { title: h.title })}
              deleteA11yLabel={t('common.deleteA11y', { title: h.title })}
            >
            {/* marginBottom removed (0) — see the same fix comment in tasks.tsx. */}
            <View style={[shared.card, styles.habitCard, styles.noMargin]}>
              <View style={styles.habitTop}>
                {/* For a numeric habit the circle is only a status indicator
                    (not tappable); for a binary habit, tapping the circle checks off today. */}
                {h.target != null ? (
                  <HabitToggle icon={h.icon} color={h.color} completed={h.completedToday} />
                ) : (
                  <Pressable
                    onPress={() => toggleToday(h)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: h.completedToday }}
                    accessibilityLabel={t('habit.todayA11y', { title: h.title })}
                  >
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completedToday} />
                  </Pressable>
                )}
                {/* Tapping the title opens the edit panel */}
                <Pressable
                  style={styles.titleArea}
                  onPress={() => openEdit(h)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.editA11y', { title: h.title })}
                >
                  <Text style={[shared.cardTitle, h.completedToday && shared.cardTitleDone]}>
                    {h.title}
                  </Text>
                  {(h.days || h.reminderTimes.length > 0 || h.period || h.goalTitle) && (
                    <Text style={styles.remind}>
                      {[
                        h.days,
                        h.period,
                        h.reminderTimes.length > 0 ? `🔔 ${h.reminderTimes.join(', ')}` : null,
                        h.goalTitle ? `🎯 ${h.goalTitle}` : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  )}
                </Pressable>
                {h.kind === 'timer' ? (
                  <HabitTimer
                    habitId={h.id}
                    amount={h.amount}
                    target={h.target ?? 0}
                    editable
                    onSet={(v) => setTodayAmount(h, v)}
                  />
                ) : h.target != null ? (
                  <AmountStepper
                    amount={h.amount}
                    target={h.target}
                    unit={h.unit}
                    onDec={() => adjustToday(h, -1)}
                    onInc={() => adjustToday(h, 1)}
                    onSet={(v) => setTodayAmount(h, v)}
                  />
                ) : (
                  h.streak > 0 && (
                    <Text style={shared.streak}>
                      {highestMilestone(h.streak)?.emoji ?? '🔥'} {h.streak}
                    </Text>
                  )
                )}
              </View>
              {/* Last 7 days — tapping it opens the stats screen */}
              <Pressable
                style={styles.week}
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('habit.statsA11y', { title: h.title })}
              >
                {h.week.map((on, i) => (
                  <View key={i} style={[styles.dayDot, on && styles.dayDotOn]} />
                ))}
              </Pressable>
            </View>
            </SwipeableRow>
            </View>
          ))
        )}
      </ScrollView>

      <HabitEditModal
        habit={editing}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    habitCard: { flexDirection: 'column', alignItems: 'stretch' },
    rowSpacing: { marginBottom: 8 },
    noMargin: { marginBottom: 0 },
    habitTop: { flexDirection: 'row', alignItems: 'center' },
    titleArea: { flex: 1 },
    remind: { fontSize: 12, color: c.muted, marginTop: 2 },
    week: { flexDirection: 'row', gap: 6, marginTop: 12, marginLeft: 42 },
    dayDot: {
      width: 16,
      height: 16,
      borderRadius: 4,
      backgroundColor: c.track,
      borderWidth: 1,
      borderColor: c.border,
    },
    dayDotOn: { backgroundColor: c.done, borderColor: c.done },
  });
