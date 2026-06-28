// "Bugün" ekranı — uygulamanın ana ekranı.
// İki bölüm: (1) bugün vadesi gelen görevler, (2) günlük alışkanlıklar + seri.
// Mimari kural: bu dosya SQL görmez; yalnızca taskRepo / habitRepo çağırır.
// Her yazma işleminden sonra reload() ile veriyi tazeleriz (SQLite senkron, hızlı).

import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { TaskEditModal } from '@/ui/TaskEditModal';

// Alışkanlık + bugünkü durumu + serisi bir arada (UI'ın ihtiyacı olan görünüm modeli).
interface HabitView {
  id: string;
  title: string;
  completedToday: boolean;
  streak: number;
}

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

// "28 Haziran Pazar" gibi okunaklı bir başlık üretir.
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

  // Tüm ekran verisini repository'lerden yeniden okur. Her mutasyondan sonra çağrılır.
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

  // Ekran her odaklandığında tazele (başka ekranda yapılan değişiklikler de yansısın).
  useFocusEffect(reload);

  const dateLabel = useMemo(formatTodayLabel, []);
  // Rozet yalnızca kalan (tamamlanmamış) görev sayısını gösterir.
  const remainingTasks = tasks.filter((t) => t.completed_at === null).length;

  const addTask = () => {
    const title = newTask.trim();
    if (!title) return;
    // Bugün ekranında eklenen görev bugüne vadelenir ki listede hemen görünsün.
    taskRepo.create({ user_id: user.id, title, due_date: today, priority: 'medium' });
    setNewTask('');
    reload();
  };

  // Görevi tamamla / geri al. Tamamlanan görev listede işaretli kalır (kaybolmaz).
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Başlık */}
        <Text style={styles.greeting}>Bugün</Text>
        <Text style={styles.date}>{dateLabel}</Text>

        {/* GÖREVLER */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Görevler</Text>
          <Text style={styles.badge}>{remainingTasks}</Text>
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Yeni görev ekle…"
            placeholderTextColor="#94a3b8"
            value={newTask}
            onChangeText={setNewTask}
            onSubmitEditing={addTask}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={addTask}>
            <Text style={styles.addBtnText}>＋</Text>
          </Pressable>
        </View>

        {tasks.length === 0 ? (
          <Text style={styles.empty}>Bugün için görev yok. Harika! 🎉</Text>
        ) : (
          tasks.map((t) => {
            const done = t.completed_at !== null;
            return (
              <View key={t.id} style={styles.card}>
                {/* Sol: kutu — dokununca tamamla/geri al */}
                <Pressable onPress={() => toggleTask(t)} hitSlop={8}>
                  <View
                    style={[
                      styles.checkbox,
                      done ? styles.checkboxDone : { borderColor: PRIORITY_COLOR[t.priority] },
                    ]}
                  >
                    {done && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </Pressable>
                {/* Gövde: dokununca düzenleme panelini aç */}
                <Pressable style={styles.cardBody} onPress={() => setEditingTask(t)}>
                  <Text style={[styles.cardTitle, done && styles.cardTitleDone]}>{t.title}</Text>
                </Pressable>
                {!done && (
                  <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[t.priority] }]} />
                )}
              </View>
            );
          })
        )}

        {/* ALIŞKANLIKLAR */}
        <View style={[styles.sectionHeader, styles.sectionGap]}>
          <Text style={styles.sectionTitle}>Alışkanlıklar</Text>
        </View>

        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            placeholder="Yeni alışkanlık ekle…"
            placeholderTextColor="#94a3b8"
            value={newHabit}
            onChangeText={setNewHabit}
            onSubmitEditing={addHabit}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={addHabit}>
            <Text style={styles.addBtnText}>＋</Text>
          </Pressable>
        </View>

        {habits.length === 0 ? (
          <Text style={styles.empty}>Henüz alışkanlık yok. Küçük bir tane ekle.</Text>
        ) : (
          habits.map((h) => (
            <Pressable key={h.id} style={styles.card} onPress={() => toggleHabit(h)}>
              <View style={[styles.checkbox, h.completedToday && styles.checkboxDone]}>
                {h.completedToday && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.cardTitle, h.completedToday && styles.cardTitleDone]}>
                {h.title}
              </Text>
              {h.streak > 0 && <Text style={styles.streak}>🔥 {h.streak}</Text>}
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Görev düzenleme paneli — bir göreve dokununca açılır */}
      <TaskEditModal
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onChanged={reload}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 48 },

  greeting: { fontSize: 34, fontWeight: '800', color: '#0f172a' },
  date: { fontSize: 15, color: '#64748b', marginTop: 2, textTransform: 'capitalize' },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionGap: { marginTop: 36 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  badge: {
    marginLeft: 8,
    minWidth: 22,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#4f46e5',
    backgroundColor: '#e0e7ff',
    borderRadius: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  addRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  addBtn: {
    width: 46,
    borderRadius: 12,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, lineHeight: 26, fontWeight: '600' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cardBody: { flex: 1, paddingVertical: 4 },
  cardTitle: { flex: 1, fontSize: 15, color: '#0f172a' },
  cardTitleDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  streak: { fontSize: 14, fontWeight: '700', color: '#f97316' },

  empty: { fontSize: 14, color: '#94a3b8', paddingVertical: 8 },
});
