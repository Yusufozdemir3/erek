// "Bugün" sekmesi — günlük özet ekranı.
// İki bölüm, alt alta: (1) o güne vadeli görevler, (2) günlük alışkanlıklar + seri.
// Ekleme yok; görev/alışkanlık ekleme kendi sekmelerinde. Burası sadece
// görüntüleme/işaretleme ekranı.
// Tarihe dokununca takvim açılır; başka bir güne gidip o günü işaretleyebilirsin.
// Mimari kural: SQL yok; yalnızca taskRepo / habitRepo çağrılır.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime, toYmd, todayDate } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { useTodayData, type HabitView } from '@/ui/useTodayData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { AmountStepper } from '@/ui/AmountStepper';
import { TimeBadge } from '@/ui/TimeBadge';
import { colors, fullDateLabel, PRIORITY_COLOR, shared } from '@/ui/theme';

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
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const { tasks, habits, reload } = useTodayData(user.id, selectedDate, today);

  const isToday = selectedDate === today;
  // Gelecek bir gün görüntüleniyorsa alışkanlık işaretlenemez — henüz yaşanmamış
  // bir günü "yapıldı" saymak streak'i ve geçmişi anlamsızlaştırır.
  const isFuture = selectedDate > today;

  const toggleTask = (t: Task) => {
    taskRepo.setCompleted(t.id, t.completed_at === null);
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    if (isFuture) return;
    habitRepo.toggleLog(h.id, selectedDate, !h.completed);
    reload();
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    reload();
  };

  // Klavyeden girilen mutlak değer — mevcut delta tabanlı incrementAmount'a
  // fark hesaplanarak devredilir, ayrı bir repo fonksiyonu gerekmez.
  const setHabitAmount = (h: HabitView, value: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, value - h.amount, h.target);
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

        {/* Tarihe dokun -> takvim açılır (ikon yok, sadece metin) */}
        <Pressable onPress={() => setShowPicker(true)} hitSlop={6}>
          <Text style={[shared.subtitle, styles.dateLink, { textTransform: 'capitalize' }]}>
            {fullDateLabel(selectedDate)}
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
                const time = extractTime(t.due_date);
                return (
                  <View key={t.id} style={shared.card}>
                    {time && <TimeBadge time={time} />}
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
                  // Nicel alışkanlık: sayaç ile miktar gir (gelecek günde devre dışı).
                  <View key={h.id} style={[shared.card, isFuture && styles.futureCard]}>
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
                      onSet={(v) => setHabitAmount(h, v)}
                      disabled={isFuture}
                    />
                  </View>
                ) : (
                  // İkili alışkanlık: karta dokununca işaretle (gelecek günde devre dışı).
                  <Pressable
                    key={h.id}
                    style={[shared.card, isFuture && styles.futureCard]}
                    onPress={() => toggleHabit(h)}
                    disabled={isFuture}
                  >
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
  futureCard: { opacity: 0.5 },
  dateLink: { color: colors.primary, fontWeight: '600' },
  list: { marginTop: 24 },
});
