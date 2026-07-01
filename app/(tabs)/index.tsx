// "Bugün" sekmesi — günlük özet ekranı.
// İki bölüm, alt alta: (1) o güne vadeli görevler, (2) günlük alışkanlıklar + seri.
// Ekleme yok; görev/alışkanlık ekleme kendi sekmelerinde. Burası sadece
// görüntüleme/işaretleme ekranı.
// Tarihe dokununca takvim açılır; başka bir güne gidip o günü işaretleyebilirsin.
// Mimari kural: SQL yok; yalnızca taskRepo / habitRepo çağrılır.

import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { isScheduledOn, todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { AmountStepper } from '@/ui/AmountStepper';
import { colors, PRIORITY_COLOR, shared } from '@/ui/theme';

interface HabitView {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  target: number | null; // nicel hedef; null = ikili
  unit: string | null;
  amount: number;        // seçilen günde yapılan miktar
  completed: boolean;    // seçilen günde tamamlandı mı
  streak: number;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "2026-06-29" -> "29 Haziran 2026" gibi tam etiket.
function fullDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Başlık: bugünse "Bugün", değilse o günün adı (örn. "Pazartesi").
function titleFor(ymd: string, today: string): string {
  if (ymd === today) return 'Bugün';
  const w = new Date(`${ymd}T00:00:00`).toLocaleDateString('tr-TR', { weekday: 'long' });
  return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1);
}

export default function TodayScreen() {
  const { user } = useAppData();
  const today = todayDate();

  const [selectedDate, setSelectedDate] = useState(today); // "YYYY-MM-DD"
  const [showPicker, setShowPicker] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<HabitView[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const reload = useCallback(() => {
    // Bugün için kümülatif "devreden görev" davranışı korunur; başka günlerde
    // sadece o güne vadeli görevler gösterilir.
    const isToday = selectedDate === today;
    setTasks(
      isToday
        ? taskRepo.listForToday(user.id, selectedDate)
        : taskRepo.listByDueDate(user.id, selectedDate)
    );
    setHabits(
      habitRepo
        .listByUser(user.id)
        // Yalnızca seçilen günde planlı (vadeli) alışkanlıklar görünsün.
        .filter((h) => isScheduledOn(h.schedule, selectedDate))
        .map((h) => ({
          id: h.id,
          title: h.title,
          icon: h.icon,
          color: h.color,
          target: h.target_amount,
          unit: h.unit,
          amount: habitRepo.getAmountOn(h.id, selectedDate),
          completed: habitRepo.isCompletedOn(h.id, selectedDate),
          streak: habitRepo.currentStreak(h.id),
        }))
    );
  }, [user.id, selectedDate, today]);

  useFocusEffect(reload);

  const isToday = selectedDate === today;

  const toggleTask = (t: Task) => {
    taskRepo.setCompleted(t.id, t.completed_at === null);
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    habitRepo.toggleLog(h.id, selectedDate, !h.completed);
    reload();
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    reload();
  };

  const onPickDate = (_e: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setSelectedDate(toYmd(picked));
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={styles.headRow}>
          <Text style={shared.greeting}>{titleFor(selectedDate, today)}</Text>
          {!isToday && (
            <Pressable onPress={() => setSelectedDate(today)} hitSlop={8}>
              <Text style={styles.backToday}>Bugüne dön</Text>
            </Pressable>
          )}
        </View>

        {/* Tarihe dokun -> takvim açılır */}
        <Pressable onPress={() => setShowPicker(true)} hitSlop={6}>
          <Text style={[shared.subtitle, styles.dateLink, { textTransform: 'capitalize' }]}>
            📅 {fullDateLabel(selectedDate)}
          </Text>
        </Pressable>

        {showPicker && (
          <DateTimePicker
            value={new Date(`${selectedDate}T00:00:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={onPickDate}
          />
        )}

        {/* Görevler ve alışkanlıklar tek liste halinde, ayrı başlık olmadan.
            Görevde öncelik noktası, alışkanlıkta 🔥 seri ayırt edici işaret. */}
        <View style={styles.list}>
          {tasks.length === 0 && habits.length === 0 ? (
            <Text style={shared.empty}>
              {isToday ? 'Bugün için bir şey yok. Harika! 🎉' : 'Bu gün için bir şey yok.'}
            </Text>
          ) : (
            <>
              {tasks.map((t) => {
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
              })}

              {habits.map((h) =>
                h.target != null ? (
                  // Nicel alışkanlık: sayaç ile miktar gir.
                  <View key={h.id} style={shared.card}>
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
                    <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
                      {h.title}
                    </Text>
                    <AmountStepper
                      amount={h.amount}
                      target={h.target}
                      unit={h.unit}
                      onDec={() => adjustHabit(h, -1)}
                      onInc={() => adjustHabit(h, 1)}
                    />
                  </View>
                ) : (
                  // İkili alışkanlık: karta dokununca işaretle.
                  <Pressable key={h.id} style={shared.card} onPress={() => toggleHabit(h)}>
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
                    <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
                      {h.title}
                    </Text>
                    {h.streak > 0 && <Text style={shared.streak}>🔥 {h.streak}</Text>}
                  </Pressable>
                )
              )}
            </>
          )}
        </View>
      </ScrollView>

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  backToday: { fontSize: 14, fontWeight: '700', color: colors.primary, paddingBottom: 6 },
  dateLink: { color: colors.primary, fontWeight: '600' },
  list: { marginTop: 24 },
});
