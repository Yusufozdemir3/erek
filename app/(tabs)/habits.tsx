// "Alışkanlıklar" sekmesi — tüm alışkanlıklar, bugünkü işaret, seri ve son 7 günün
// geçmişi. Kutuya dokununca bugünü işaretler/geri alır.
// Mimari kural: SQL yok; yalnızca habitRepo çağrılır.

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { colors, shared } from '@/ui/theme';

interface HabitView {
  id: string;
  title: string;
  remindAt: string | null; // "HH:MM" hatırlatma saati
  completedToday: boolean;
  streak: number;
  week: boolean[]; // son 7 gün, en eskiden bugüne
}

// Bugün dahil son `count` günün "YYYY-MM-DD" listesi (en eskiden bugüne).
function lastDays(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(d.getDate() - i);
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}

export default function HabitsScreen() {
  const { user } = useAppData();
  const today = todayDate();

  const [habits, setHabits] = useState<HabitView[]>([]);
  const [newHabit, setNewHabit] = useState('');
  const [editing, setEditing] = useState<Habit | null>(null); // null = panel kapalı

  const reload = useCallback(() => {
    const week = lastDays(7);
    setHabits(
      habitRepo.listByUser(user.id).map((h) => {
        // Son 60 günün tamamlanan tarihlerini tek sorguda topla, haftayı ondan üret.
        const completed = new Set(
          habitRepo
            .recentLogs(h.id, 60)
            .filter((l) => l.completed === 1)
            .map((l) => l.log_date)
        );
        return {
          id: h.id,
          title: h.title,
          remindAt: h.remind_at,
          completedToday: completed.has(today),
          streak: habitRepo.currentStreak(h.id),
          week: week.map((d) => completed.has(d)),
        };
      })
    );
  }, [user.id, today]);

  useFocusEffect(reload);

  const addHabit = () => {
    const title = newHabit.trim();
    if (!title) return;
    habitRepo.create({ user_id: user.id, title });
    setNewHabit('');
    reload();
  };

  const toggleToday = (h: HabitView) => {
    habitRepo.toggleLog(h.id, today, !h.completedToday);
    reload();
  };

  const openEdit = (h: HabitView) => {
    setEditing(habitRepo.getById(h.id));
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Text style={shared.greeting}>Alışkanlıklar</Text>
        <Text style={shared.subtitle}>Her gün küçük bir adım</Text>

        <View style={[shared.addRow, { marginTop: 20 }]}>
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
            <View key={h.id} style={[shared.card, styles.habitCard]}>
              <View style={styles.habitTop}>
                <Pressable onPress={() => toggleToday(h)} hitSlop={8}>
                  <View style={[shared.checkbox, h.completedToday && shared.checkboxDone]}>
                    {h.completedToday && <Text style={shared.checkmark}>✓</Text>}
                  </View>
                </Pressable>
                {/* Başlığa dokununca düzenleme paneli açılır */}
                <Pressable style={styles.titleArea} onPress={() => openEdit(h)}>
                  <Text style={[shared.cardTitle, h.completedToday && shared.cardTitleDone]}>
                    {h.title}
                  </Text>
                  {h.remindAt && <Text style={styles.remind}>🔔 {h.remindAt}</Text>}
                </Pressable>
                {h.streak > 0 && <Text style={shared.streak}>🔥 {h.streak}</Text>}
              </View>
              {/* Son 7 gün */}
              <View style={styles.week}>
                {h.week.map((on, i) => (
                  <View key={i} style={[styles.dayDot, on && styles.dayDotOn]} />
                ))}
              </View>
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

const styles = StyleSheet.create({
  habitCard: { flexDirection: 'column', alignItems: 'stretch' },
  habitTop: { flexDirection: 'row', alignItems: 'center' },
  titleArea: { flex: 1 },
  remind: { fontSize: 12, color: '#64748b', marginTop: 2 },
  week: { flexDirection: 'row', gap: 6, marginTop: 12, marginLeft: 34 },
  dayDot: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayDotOn: { backgroundColor: colors.done, borderColor: colors.done },
});
