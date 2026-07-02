// "Görevler" sekmesi — yalnızca bugün değil, TÜM aktif görevler.
// "Bugün" ekranından farkı: tarihi ileride olan ya da tarihsiz görevler de burada
// görünür. Tamamlananlar listenin altına iner. Göreve dokununca düzenleme paneli.
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır.
// Mimari kural: SQL yok; yalnızca taskRepo çağrılır.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { ProfileButton } from '@/ui/ProfileButton';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { TimeBadge } from '@/ui/TimeBadge';
import { PRIORITY_COLOR, shared, shortDate } from '@/ui/theme';

export default function TasksScreen() {
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
    taskRepo.setCompleted(t.id, t.completed_at === null);
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>Görevler</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>{remaining} görev bekliyor</Text>

        {tasks.length === 0 ? (
          <Text style={[shared.empty, { marginTop: 20 }]}>
            Henüz görev yok. Alttaki ＋ ile ekleyebilirsin.
          </Text>
        ) : (
          tasks.map((t, i) => {
            const done = t.completed_at !== null;
            const time = extractTime(t.due_date);
            return (
              <View key={t.id} style={[shared.card, i === 0 && { marginTop: 20 }]}>
                {time && !done && <TimeBadge time={time} />}
                <Pressable onPress={() => toggleTask(t)} hitSlop={8}>
                  <View
                    style={[
                      shared.checkbox,
                      done ? shared.checkboxDone : { borderColor: PRIORITY_COLOR[t.priority] },
                    ]}
                  >
                    {done && <Text style={shared.checkmark}>✓</Text>}
                  </View>
                </Pressable>
                <Pressable style={shared.cardBody} onPress={() => setEditingTask(t)}>
                  <Text style={[shared.cardTitle, done && shared.cardTitleDone]}>{t.title}</Text>
                  {((t.due_date && !done) || subtaskCounts[t.id]) && (
                    <Text style={styles.due}>
                      {[
                        t.due_date && !done ? shortDate(t.due_date) : null,
                        subtaskCounts[t.id]
                          ? `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} alt görev`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  )}
                </Pressable>
                {!done && (
                  <View style={[shared.priorityDot, { backgroundColor: PRIORITY_COLOR[t.priority] }]} />
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  due: { fontSize: 12, color: '#64748b', marginTop: 3 },
});
