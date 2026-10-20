// Profile › Archive: what moved out of the lists by itself (db/archive.ts) —
// tasks a week after completion, goals the day after, habits once their end
// date passed. "Restore" puts an item back as it is; tapping a habit or goal
// opens its detail (stats and history stay intact).

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { goalRepo, habitRepo, taskRepo } from '@/db';
import type { Goal, Habit, Task } from '@/db';
import { tapLight } from '@/lib/haptics';
import { todayDate, toYmd } from '@/lib/helpers';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { makeProfileStyles } from '@/ui/profileStyles';
import { shortDate } from '@/ui/theme';
import { useTheme } from '@/ui/ThemeProvider';

type Tab = 'tasks' | 'habits' | 'goals';

interface Row {
  id: string;
  title: string;
  detail: string;
  open?: () => void;
}

// completed_at is an ISO instant; the label wants the local day.
const localDay = (iso: string | null) => (iso ? toYmd(new Date(iso)) : null);

export default function ArchiveScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeProfileStyles(colors);
  const { user, dataVersion, notifyDataChanged } = useAppData();
  const [tab, setTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const reload = useCallback(() => {
    const today = todayDate();
    setTasks(taskRepo.listArchived(user.id, today));
    setHabits(habitRepo.listArchived(user.id, today));
    setGoals(goalRepo.listArchived(user.id, today));
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

  const restore = (kind: Tab, id: string) => {
    if (kind === 'tasks') taskRepo.unarchive(id);
    else if (kind === 'habits') habitRepo.unarchive(id);
    else goalRepo.unarchive(id);
    tapLight();
    reload();
    notifyDataChanged();
  };

  const day = (ymd: string | null) => shortDate(ymd, lang);
  const rows: Row[] =
    tab === 'tasks'
      ? tasks.map((x) => ({ id: x.id, title: x.title, detail: t('archive.completedOn', { date: day(localDay(x.completed_at)) }) }))
      : tab === 'habits'
        ? habits.map((x) => ({
            id: x.id,
            title: x.title,
            detail: t('archive.endedOn', { date: day(x.end_date) }),
            open: () => router.push({ pathname: '/habit/[id]', params: { id: x.id } }),
          }))
        : goals.map((x) => ({
            id: x.id,
            title: x.title,
            detail: t('archive.completedOn', { date: day(localDay(x.completed_at)) }),
            open: () => router.push({ pathname: '/goal/[id]', params: { id: x.id, tab: 'stats' } }),
          }));

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'tasks', label: t('tabs.tasks'), n: tasks.length },
    { key: 'habits', label: t('tabs.habits'), n: habits.length },
    { key: 'goals', label: t('tabs.goals'), n: goals.length },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.muted}>{t('archive.hint')}</Text>

      <View style={[styles.segRow, local.tabs]}>
        {tabs.map((x) => {
          const on = x.key === tab;
          return (
            <Pressable
              key={x.key}
              style={[styles.segBtn, on && styles.segBtnOn]}
              onPress={() => setTab(x.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                {x.n > 0 ? `${x.label} (${x.n})` : x.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {rows.length === 0 ? (
        <EmptyState icon="done" title={t('archive.emptyTitle')} subtitle={t(`archive.empty.${tab}`)} />
      ) : (
        <View style={[styles.card, local.list]}>
          {rows.map((r, i) => (
            <View key={r.id} style={[local.row, i > 0 && [local.divider, { borderTopColor: colors.border }]]}>
              <Pressable
                style={local.main}
                onPress={r.open}
                disabled={!r.open}
                accessibilityRole={r.open ? 'button' : undefined}
                accessibilityLabel={`${r.title}. ${r.detail}`}
              >
                <Text style={[local.title, { color: colors.text }]} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={[local.detail, { color: colors.faint }]}>{r.detail}</Text>
              </Pressable>
              <Pressable
                onPress={() => restore(tab, r.id)}
                hitSlop={8}
                style={[local.restore, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t('archive.restoreA11y', { title: r.title })}
              >
                <Feather name="rotate-ccw" size={14} color={colors.primary} />
                <Text style={[local.restoreText, { color: colors.primary }]}>{t('archive.restore')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  tabs: { marginTop: 16 },
  list: { marginTop: 16, paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  main: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 12, marginTop: 2 },
  restore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  restoreText: { fontSize: 13, fontWeight: '700' },
});
