// "Görevler" sekmesi — yalnızca bugün değil, TÜM aktif görevler.
// "Bugün" ekranından farkı: tarihi ileride olan ya da tarihsiz görevler de burada
// görünür. Tamamlananlar listenin altına iner. Göreve dokununca düzenleme paneli.
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır.
// Mimari kural: SQL yok; yalnızca taskRepo çağrılır.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminder, scheduleTaskReminder } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { PriorityMark } from '@/ui/PriorityMark';
import { ProfileButton } from '@/ui/ProfileButton';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

export default function TasksScreen() {
  const { colors, shared } = useTheme();
  // Not: aşağıdaki map değişkeni `t` (görev) ile çakışmasın diye i18n `tr` alınır.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion } = useAppData();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  // Görev kartındaki "1/3 alt görev" rozeti; yalnızca alt görevi olanlar girer.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});

  const reload = useCallback(() => {
    // Tamamlanmamışlar üstte, tamamlananlar altta.
    const all = taskRepo.listByUser(user.id);
    all.sort((a, b) => Number(a.completed_at !== null) - Number(b.completed_at !== null));
    setTasks(all);
    const counts: Record<string, { done: number; total: number }> = {};
    for (const t of all) {
      const c = subtaskRepo.countForTask(t.id);
      if (c.total > 0) counts[t.id] = c;
    }
    setSubtaskCounts(counts);
    // dataVersion: ＋ menüsünden görev eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // Tamamlanınca saatli hatırlatma varsa iptal edilir; geri açılınca (vadesi
    // geçmemişse) yeniden kurulur.
    if (completing) {
      cancelTaskReminder(t.id);
    } else {
      const reopened = taskRepo.getById(t.id);
      if (reopened) scheduleTaskReminder(reopened);
    }
    // Yeniden sırala (tamamlanan alta iner); her kart Animated.View + LinearTransition
    // olduğu için konum değişimi yumuşakça animasyonlanır (Fabric'te de çalışır).
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{tr('tabs.tasks')}</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>{tr('screen.tasksSubtitle', { n: remaining })}</Text>

        {tasks.length === 0 ? (
          <EmptyState
            emoji="📝"
            title={tr('empty.tasksTitle')}
            subtitle={tr('empty.tasksBody')}
          />
        ) : (
          tasks.map((t, i) => {
            const done = t.completed_at !== null;
            const time = extractTime(t.due_date);
            return (
              <Animated.View
                key={t.id}
                layout={LinearTransition.duration(260)}
                style={[shared.card, i === 0 && { marginTop: 20 }]}
              >
                {time && !done && <TimeBadge time={time} endTime={t.end_time} />}
                <Pressable
                  onPress={() => toggleTask(t)}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={t.title}
                >
                  <View
                    style={[
                      shared.checkbox,
                      done ? shared.checkboxDone : { borderColor: PRIORITY_COLOR[t.priority] },
                    ]}
                  >
                    {done && <Text style={shared.checkmark}>✓</Text>}
                  </View>
                </Pressable>
                <Pressable
                  style={shared.cardBody}
                  onPress={() => setEditingTask(t)}
                  accessibilityRole="button"
                  accessibilityLabel={tr('common.editA11y', { title: t.title })}
                >
                  <Text style={[shared.cardTitle, done && shared.cardTitleDone]}>{t.title}</Text>
                  {((t.due_date && !done) || subtaskCounts[t.id]) && (
                    <Text style={styles.due}>
                      {[
                        t.due_date && !done ? shortDate(t.due_date, lang) : null,
                        subtaskCounts[t.id]
                          ? `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} ${tr('task.subtaskCountSuffix')}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  )}
                </Pressable>
                {!done && <PriorityMark priority={t.priority} />}
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    due: { fontSize: 12, color: c.muted, marginTop: 3 },
  });
