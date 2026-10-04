// "Habits" tab — all habits, today's check mark, streak, and the last 7 days'
// history. Tapping the box checks off/undoes today.
// No adding here: that happens from the ＋ menu in the tab bar.
// Architecture rule: no SQL; only habitRepo is called.

import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { habitRepo } from '@/db';
import { fmtClock, lastDays } from '@/lib/helpers';
import { matchesWords, queryWords } from '@/lib/search';
import type { Habit } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelHabitReminders, rescheduleEverything } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { useHabitsData, type HabitListItem } from '@/ui/useHabitsData';
import { promptUnlinkGoalIfCompleted } from '@/ui/goalCompletionPrompt';
import { EmptyState } from '@/ui/EmptyState';
import { UndoSnackbar, useUndoNotice } from '@/ui/UndoSnackbar';
import { SearchBox } from '@/ui/SearchBox';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { HeaderActions } from '@/ui/HeaderActions';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';
import { MetaLine } from '@/ui/MetaLine';
import { StreakBadge } from '@/ui/StreakBadge';
import { usePullRefresh } from '@/ui/usePullRefresh';
import { SharedHabitsSection, useSharedLists } from '@/ui/SharedLists';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, type Colors } from '@/ui/theme';

// The search field only appears once the list is long enough to need it.
const SEARCH_MIN_HABITS = 8;

export default function HabitsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const guide = useFeatureGuide('habits');
  const [editing, setEditing] = useState<Habit | null>(null); // null = panel closed
  // Only one card's swipe actions may be open at a time.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const { today, habits: allHabits, reload } = useHabitsData(user.id);
  const [query, setQuery] = useState('');
  const words = useMemo(() => queryWords(query, lang), [query, lang]);
  const searching = words.length > 0;
  // A typed search stays visible even if the list later shrinks below the threshold.
  const showSearch = allHabits.length >= SEARCH_MIN_HABITS || query.length > 0;
  const habits = useMemo(
    () => (searching ? allHabits.filter((h) => matchesWords(h.title, words, lang)) : allHabits),
    [allHabits, searching, words, lang]
  );
  const shared_ = useSharedLists();
  const { refreshing, onRefresh } = usePullRefresh(() => {
    reload();
    shared_.reload();
  });

  // Weekday letters for the 7-day squares (oldest → today); the squares used to
  // be unlabeled, so you couldn't tell which square was which day.
  const weekLabels = lastDays(7).map((d) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], { weekday: 'narrow' })
  );

  const toggleToday = (h: HabitListItem) => {
    const completing = !h.completedToday;
    const goalDone = habitRepo.toggleLog(h.id, today, completing);
    completing ? notifySuccess() : tapLight();
    reload();
    promptUnlinkGoalIfCompleted(h.id, goalDone, t, reload);
  };

  const openEdit = (h: HabitListItem) => {
    setEditing(habitRepo.getById(h.id));
  };

  const undo = useUndoNotice();

  const removeHabit = (h: HabitListItem) => {
    // habitRepo.softDelete cleans up the reminder ROWS; what's cancelled here
    // is the trigger sitting in the OS's notification queue. cancelByPrefix
    // reads the native list, so it can reject — if not caught this becomes an
    // "unhandled rejection".
    habitRepo.softDelete(h.id);
    cancelHabitReminders(h.id).catch((e) =>
      console.warn('[Notification] Failed to cancel reminders for deleted habit:', e)
    );
    undo.show({
      text: t('undo.deleted', { title: h.title }),
      onUndo: () => {
        habitRepo.restore(h.id);
        rescheduleEverything(user.id).catch(() => {});
        reload();
      },
    });
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={shared.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{t('tabs.habits')}</Text>
          <HeaderActions onHelp={guide.open} />
        </View>
        <Text style={shared.subtitle}>{t('screen.habitsSubtitle')}</Text>
        {showSearch && (
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder={t('habits.searchPlaceholder')}
            clearLabel={t('tasks.searchClear')}
          />
        )}

        {habits.length === 0 ? (
          searching ? (
            <EmptyState icon="search" title={t('habits.searchEmpty')} />
          ) : (
            <EmptyState icon="sprout" title={t('empty.habitsTitle')} subtitle={t('empty.habitsBody')} />
          )
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
                  <MetaLine
                    items={[
                      h.days ? { text: h.days, icon: 'repeat' } : null,
                      h.period ? { text: h.period, icon: 'calendar' } : null,
                      h.reminderTimes.length > 0
                        ? { text: h.reminderTimes.join(', '), icon: 'bell' }
                        : null,
                      h.goalTitle ? { text: h.goalTitle, icon: 'target' } : null,
                    ]}
                  />
                </Pressable>
                {/* No counter on this tab: amounts are entered on Today. Numeric/
                    timer habits show today's progress as plain text instead. */}
                {h.target != null ? (
                  <Text style={[styles.progress, h.completedToday && styles.progressDone]}>
                    {h.kind === 'timer'
                      ? `${fmtClock(h.amount)} / ${fmtClock(h.target)}`
                      : `${h.amount}/${h.target}${h.unit ? ` ${h.unit}` : ''}`}
                  </Text>
                ) : (
                  h.streak > 0 && <StreakBadge streak={h.streak} />
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
                  <View key={i} style={styles.dayCol}>
                    <View style={[styles.dayDot, on && styles.dayDotOn]} />
                    <Text style={[styles.dayLabel, i === 6 && styles.dayLabelToday]}>
                      {weekLabels[i]}
                    </Text>
                  </View>
                ))}
              </Pressable>
            </View>
            </SwipeableRow>
            </View>
          ))
        )}

        <SharedHabitsSection items={shared_.sharedHabits} onHide={shared_.hideHabit} />
      </ScrollView>

      <HabitEditModal
        habit={editing}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
      <UndoSnackbar notice={undo.notice} onDone={undo.dismiss} />
      <FeatureGuide guide="habits" visible={guide.visible} onClose={guide.close} />
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
    progress: { fontSize: 13, fontWeight: '700', color: c.muted, marginLeft: 8 },
    progressDone: { color: c.done },
    week: { flexDirection: 'row', gap: 6, marginTop: 12, marginLeft: 42 },
    dayCol: { alignItems: 'center', gap: 2 },
    dayLabel: { fontSize: 9, fontWeight: '600', color: c.faint, textTransform: 'uppercase' },
    dayLabelToday: { color: c.primary, fontWeight: '800' },
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
