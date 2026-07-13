// "Bugün" sekmesi — günlük özet ekranı.
// İki bölüm, alt alta: (1) o güne vadeli görevler, (2) günlük alışkanlıklar + seri.
// Ekleme yok; görev/alışkanlık ekleme kendi sekmelerinde. Burası sadece
// görüntüleme/işaretleme ekranı.
// Tarihe dokununca takvim açılır; başka bir güne gidip o günü işaretleyebilirsin.
// Mimari kural: SQL yok; yalnızca taskRepo / habitRepo çağrılır.

import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { habitRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { extractTime, toYmd, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { useAppData } from '@/ui/AppData';
import { useTodayData, type HabitView } from '@/ui/useTodayData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { DailySummary } from '@/ui/DailySummary';
import { EmptyState } from '@/ui/EmptyState';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { PriorityMark } from '@/ui/PriorityMark';
import { ProfileButton } from '@/ui/ProfileButton';
import { TimeBadge } from '@/ui/TimeBadge';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { DATE_LOCALE, fullDateLabel, PRIORITY_COLOR, type Colors } from '@/ui/theme';

// Liste kartları tamamlanınca yeniden sıralanır (tamamlanan alta iner); her kart
// bu layout geçişiyle sarıldığından konum değişimi yumuşakça animasyonlanır.
const LIST_LAYOUT = LinearTransition.duration(260);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Başlık: bugünse "Bugün" (çevrili), değilse o günün adı (örn. "Pazartesi").
function titleFor(ymd: string, today: string, lang: Lang, todayLabel: string): string {
  if (ymd === today) return todayLabel;
  const locale = DATE_LOCALE[lang];
  const w = new Date(`${ymd}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' });
  return w.charAt(0).toLocaleUpperCase(locale) + w.slice(1);
}

export default function TodayScreen() {
  const { colors, shared } = useTheme();
  // Not: map değişkeni `t` (görev) ile çakışmasın diye i18n `tr` alınır.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const today = todayDate();

  const [selectedDate, setSelectedDate] = useState(today); // "YYYY-MM-DD"
  const [showPicker, setShowPicker] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const { tasks, habits, subtaskCounts, reload } = useTodayData(user.id, selectedDate, today);

  const isToday = selectedDate === today;
  // Gelecek bir gün görüntüleniyorsa alışkanlık işaretlenemez — henüz yaşanmamış
  // bir günü "yapıldı" saymak streak'i ve geçmişi anlamsızlaştırır.
  const isFuture = selectedDate > today;

  // Bugünün üst özeti için tamamlanma sayıları.
  const habitsDone = habits.filter((h) => h.completed).length;
  const tasksDone = tasks.filter((t) => t.completed_at !== null).length;

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    if (isFuture) return;
    const completing = !h.completed;
    habitRepo.toggleLog(h.id, selectedDate, completing);
    completing ? notifySuccess() : tapLight();
    reload();
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    tapLight();
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
          <Text style={shared.greeting}>{titleFor(selectedDate, today, lang, tr('tabs.today'))}</Text>
          <View style={styles.headRight}>
            {!isToday && (
              <Pressable onPress={() => setSelectedDate(today)} hitSlop={8}>
                <Text style={styles.backToday}>{tr('today.backToday')}</Text>
              </Pressable>
            )}
            <ProfileButton />
          </View>
        </View>

        {/* Tarihe dokun -> takvim açılır (ikon yok, sadece metin) */}
        <Pressable onPress={() => setShowPicker(true)} hitSlop={6}>
          <Text style={[shared.subtitle, styles.dateLink, { textTransform: 'capitalize' }]}>
            {fullDateLabel(selectedDate, lang)}
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

        {/* Günün ilerleme özeti — yalnızca bugün için anlamlı. */}
        {isToday && (
          <DailySummary
            habitsDone={habitsDone}
            habitsTotal={habits.length}
            tasksDone={tasksDone}
            tasksTotal={tasks.length}
          />
        )}

        {/* Görevler ve alışkanlıklar tek liste halinde, ayrı başlık olmadan.
            Görevde öncelik noktası, alışkanlıkta 🔥 seri ayırt edici işaret. */}
        <View style={styles.list}>
          {tasks.length === 0 && habits.length === 0 ? (
            <EmptyState
              emoji={isToday ? '🎉' : '🌙'}
              title={isToday ? tr('empty.todayTitle') : tr('empty.otherDayTitle')}
              subtitle={isToday ? tr('empty.todayBody') : undefined}
            />
          ) : (
            <>
              {tasks.map((t) => {
                const done = t.completed_at !== null;
                const time = extractTime(t.due_date);
                return (
                  <Animated.View key={t.id} layout={LIST_LAYOUT} style={shared.card}>
                    {time && <TimeBadge time={time} endTime={t.end_time} />}
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
                      {subtaskCounts[t.id] && (
                        <Text style={styles.subCount}>
                          {subtaskCounts[t.id].done}/{subtaskCounts[t.id].total} {tr('task.subtaskCountSuffix')}
                        </Text>
                      )}
                    </Pressable>
                    {!done && <PriorityMark priority={t.priority} />}
                  </Animated.View>
                );
              })}

              {habits.map((h) =>
                h.kind === 'timer' ? (
                  // Zamanlayıcı alışkanlık: salt-okunur ilerleme (Aşama B'de kontrol).
                  <Animated.View
                    key={h.id}
                    layout={LIST_LAYOUT}
                    style={[shared.card, isFuture && styles.futureCard]}
                  >
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
                    <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
                      {h.title}
                    </Text>
                    <HabitTimer
                      habitId={h.id}
                      amount={h.amount}
                      target={h.target ?? 0}
                      editable={isToday}
                    />
                  </Animated.View>
                ) : h.target != null ? (
                  // Nicel alışkanlık: sayaç ile miktar gir (gelecek günde devre dışı).
                  <Animated.View
                    key={h.id}
                    layout={LIST_LAYOUT}
                    style={[shared.card, isFuture && styles.futureCard]}
                  >
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
                  </Animated.View>
                ) : (
                  // İkili alışkanlık: karta dokununca işaretle (gelecek günde devre dışı).
                  <AnimatedPressable
                    key={h.id}
                    layout={LIST_LAYOUT}
                    style={[shared.card, isFuture && styles.futureCard]}
                    onPress={() => toggleHabit(h)}
                    disabled={isFuture}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: h.completed, disabled: isFuture }}
                    accessibilityLabel={tr('habit.checkboxA11y', { title: h.title })}
                  >
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completed} />
                    <Text style={[shared.cardTitle, h.completed && shared.cardTitleDone]}>
                      {h.title}
                    </Text>
                    {h.streak > 0 && (
                      <Text style={shared.streak}>
                        {highestMilestone(h.streak)?.emoji ?? '🔥'} {h.streak}
                      </Text>
                    )}
                  </AnimatedPressable>
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

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    backToday: { fontSize: 14, fontWeight: '700', color: c.primary },
    futureCard: { opacity: 0.5 },
    dateLink: { color: c.primary, fontWeight: '600' },
    list: { marginTop: 24 },
    subCount: { fontSize: 12, color: c.muted, marginTop: 3 },
  });
