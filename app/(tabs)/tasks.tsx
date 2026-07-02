// "Görevler" sekmesi — yalnızca bugün değil, TÜM aktif görevler.
// "Bugün" ekranından farkı: tarihi ileride olan ya da tarihsiz görevler de burada
// görünür. Tamamlananlar listenin altına iner. Göreve dokununca düzenleme paneli.
// Mimari kural: SQL yok; yalnızca taskRepo çağrılır.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { TimeBadge } from '@/ui/TimeBadge';
import { PRIORITY_COLOR, shared, shortDate } from '@/ui/theme';

export default function TasksScreen() {
  const { user } = useAppData();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTask, setNewTask] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const reload = useCallback(() => {
    // Tamamlanmamışlar üstte, tamamlananlar altta.
    const all = taskRepo.listByUser(user.id);
    all.sort((a, b) => Number(a.completed_at !== null) - Number(b.completed_at !== null));
    setTasks(all);
  }, [user.id]);

  useFocusEffect(reload);

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    // Görevler sekmesinden eklenen görev tarihsizdir; tarih düzenleme panelinden verilir.
    taskRepo.create({ user_id: user.id, title, priority: 'medium' });
    setNewTask('');
    reload();
  };

  const toggleTask = (t: Task) => {
    taskRepo.setCompleted(t.id, t.completed_at === null);
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Text style={shared.greeting}>Görevler</Text>
        <Text style={shared.subtitle}>{remaining} görev bekliyor</Text>

        <View style={[shared.addRow, { marginTop: 20 }]}>
          <TextInput
            style={shared.input}
            placeholder="Yeni görev ekle…"
            placeholderTextColor="#94a3b8"
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={addTask}
            returnKeyType="done"
          />
          <Pressable style={shared.addBtn} onPress={addTask}>
            <Text style={shared.addBtnText}>＋</Text>
          </Pressable>
        </View>

        {tasks.length === 0 ? (
          <Text style={shared.empty}>Henüz görev yok. İlk görevini ekle.</Text>
        ) : (
          tasks.map((t) => {
            const done = t.completed_at !== null;
            const time = extractTime(t.due_date);
            return (
              <View key={t.id} style={shared.card}>
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
                  {t.due_date && !done && (
                    <Text style={styles.due}>{shortDate(t.due_date)}</Text>
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
