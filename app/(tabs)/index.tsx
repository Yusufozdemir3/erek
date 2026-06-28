// "Bugün" sekmesi — günlük özet ekranı.
// İki bölüm: (1) bugün vadesi gelen görevler, (2) günlük alışkanlıklar + seri.
// Tüm görev/alışkanlık yönetimi kendi sekmelerinde; burası sadece "bugün"e odaklı.
// Mimari kural: SQL yok; yalnızca taskRepo / habitRepo çağrılır.

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { PRIORITY_COLOR, shared } from '@/ui/theme';

interface HabitView {
  id: string;
  title: string;
  completedToday: boolean;
  streak: number;
}

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function TodayScreen() {
  const { user } = useAppData();
  const today = todayDate();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);
  const [newTask, setNewTask] = useState('');
  const [newHabit, setNewHabit] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const reload = useCallback(() => {
    setTasks(taskRepo.listForToday(user.id, today));
    setHabits(
      habitRepo.listByUser(user.id).map((h) => ({
        id: h.id,
        title: h.title,
        completedToday: habitRepo.isCompletedOn(h.id, today),
        streak: habitRepo.currentStreak(h.id),
      }))
    );
  }, [user.id, today]);

  useFocusEffect(reload);

  const dateLabel = useMemo(formatTodayLabel, []);
  const remainingTasks = tasks.filter((t) => t.completed_at === null).length;

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    // Bugün ekranında eklenen görev bugüne vadelenir ki listede hemen görünsün.
    taskRepo.create({ user_id: user.id, title, due_date: today, priority: 'medium' });
    setNewTask('');
    reload();
  };

  const toggleTask = (t: Task) => {
    taskRepo.setCompleted(t.id, t.completed_at === null);
    reload();
  };

  const addHabit = () => {
    const title = newHabit.trim();
    if (!title) return;
    habitRepo.create({ user_id: user.id, title });
    setNewHabit('');
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    habitRepo.toggleLog(h.id, today, !h.completedToday);
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Text style={shared.greeting}>Bugün</Text>
        <Text style={[shared.subtitle, { textTransform: 'capitalize' }]}>{dateLabel}</Text>

        {/* GÖREVLER */}
        <View style={shared.sectionHeader}>
          <Text style={shared.sectionTitle}>Görevler</Text>
          <Text style={shared.badge}>{remainingTasks}</Text>
        </View>

        <View style={shared.addRow}>
          <TextInput
            style={shared.input}
            placeholder="Bugüne görev ekle…"
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
          <Text style={shared.empty}>Bugün için görev yok. Harika! 🎉</Text>
        ) : (
          tasks.map((t) => {
            const done = t.completed_at !== null;
            return (
              <View key={t.id} style={shared.card}>
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
                </Pressable>
                {!done && (
                  <View style={[shared.priorityDot, { backgroundColor: PRIORITY_COLOR[t.priority] }]} />
                )}
              </View>
            );
          })
        )}

        {/* ALIŞKANLIKLAR */}
        <View style={[shared.sectionHeader, { marginTop: 36 }]}>
          <Text style={shared.sectionTitle}>Alışkanlıklar</Text>
        </View>

        <View style={shared.addRow}>
          <TextInput
            style={shared.input}
            placeholder="Yeni alışkanlık ekle…"
            placeholderTextColor="#94a3b8"
            value={newHabit}
            onChangeText={setNewHabit}
            onSubmitEditing={addHabit}
            returnKeyType="done"
          />
          <Pressable style={shared.addBtn} onPress={addHabit}>
            <Text style={shared.addBtnText}>＋</Text>
          </Pressable>
        </View>

        {habits.length === 0 ? (
          <Text style={shared.empty}>Henüz alışkanlık yok. Küçük bir tane ekle.</Text>
        ) : (
          habits.map((h) => (
            <Pressable key={h.id} style={shared.card} onPress={() => toggleHabit(h)}>
              <View style={[shared.checkbox, h.completedToday && shared.checkboxDone]}>
                {h.completedToday && <Text style={shared.checkmark}>✓</Text>}
              </View>
              <Text style={[shared.cardTitle, h.completedToday && shared.cardTitleDone]}>
                {h.title}
              </Text>
              {h.streak > 0 && <Text style={shared.streak}>🔥 {h.streak}</Text>}
            </Pressable>
          ))
        )}
      </ScrollView>

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}
