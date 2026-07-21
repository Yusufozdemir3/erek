// "Bugün" sekmesi — günlük özet ekranı.
// İki bölüm, alt alta: (1) o güne vadeli görevler, (2) günlük alışkanlıklar + seri.
// Ekleme yok; görev/alışkanlık ekleme kendi sekmelerinde. Burası sadece
// görüntüleme/işaretleme ekranı.
// Tarihe dokununca takvim açılır; başka bir güne gidip o günü işaretleyebilirsin.
// Mimari kural: SQL yok; yalnızca taskRepo / habitRepo çağrılır.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { habitRepo, reminderRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, toYmd, todayDate } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { cancelTaskReminders, scheduleTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { refreshWidget } from '@/widget/widgetData';
import { useTodayData, type HabitView } from '@/ui/useTodayData';
import { TaskEditModal } from '@/ui/TaskEditModal';
import { DatePickerModal } from '@/ui/DatePickerModal';
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
import { DATE_LOCALE, fullDateLabel, PRIORITY_COLOR, shortDate, type Colors } from '@/ui/theme';

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

type TypeFilter = 'all' | 'task' | 'habit';

export default function TodayScreen() {
  const { colors, shared } = useTheme();
  // Not: map değişkeni `t` (görev) ile çakışmasın diye i18n `tr` alınır.
  const { t: tr, lang } = useI18n();
  const styles = makeStyles(colors);
  // selectedDate paylaşılır (AppData): merkezi ＋ menüsü buradan okuyup yeni
  // görevi bakılan güne varsayılan tarihle ekler.
  const { user, selectedDate, setSelectedDate, hideCompleted } = useAppData();
  const today = todayDate();

  const [showPicker, setShowPicker] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { tasks, habits, subtaskCounts, reload } = useTodayData(user.id, selectedDate, today);

  // Filtreler yalnızca görünümü daraltır — özet (DailySummary) ve gerçek
  // "gün boş mu" durumu her zaman tam listeye göre hesaplanır.
  const showTasks = typeFilter !== 'habit';
  const showHabits = typeFilter !== 'task';
  const filteredTasks = showTasks
    ? tasks.filter((t) => !hideCompleted || t.completed_at === null)
    : [];
  const filteredHabits = showHabits
    ? habits.filter((h) => !hideCompleted || !h.completed)
    : [];
  const dayIsEmpty = tasks.length === 0 && habits.length === 0;
  const filterHidesEverything =
    !dayIsEmpty && filteredTasks.length === 0 && filteredHabits.length === 0;

  const isToday = selectedDate === today;
  // Gelecek bir gün görüntüleniyorsa alışkanlık işaretlenemez — henüz yaşanmamış
  // bir günü "yapıldı" saymak streak'i ve geçmişi anlamsızlaştırır.
  const isFuture = selectedDate > today;

  // Bugünün üst özeti için tamamlanma sayıları.
  const habitsDone = habits.filter((h) => h.completed).length;
  const tasksDone = tasks.filter((t) => t.completed_at !== null).length;

  // Tekrarlayan görev kartındaki "🔁 Her gün / Pzt·Çar·Cum / 3 günde bir ..."
  // rozeti için etiket seti (bkz. helpers.buildScheduleLabels).
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // Tekrarlayan görev "tamamla"da tamamlanmak yerine bir sonraki tarihe ileri
    // sarabilir — bu durumda görev hâlâ tamamlanmamış ama yeni tarihlidir. Bu
    // yüzden güncel duruma bakarız: tamamlanmamışsa (geri açıldı ya da ileri
    // sardı) hatırlatmayı yeni değere göre kur, tamamlandıysa iptal et.
    const after = taskRepo.getById(t.id);
    if (after && after.completed_at === null) {
      scheduleTaskReminders(after, reminderRepo.listByEntity('task', after.id));
    } else {
      cancelTaskReminders(t.id);
    }
    reload();
  };

  const toggleHabit = (h: HabitView) => {
    if (isFuture) return;
    const completing = !h.completed;
    habitRepo.toggleLog(h.id, selectedDate, completing);
    completing ? notifySuccess() : tapLight();
    reload();
    // İşaretleme lokal reload kullanır (dataVersion artmaz); ana ekran widget'ını
    // ayrıca tazele. refreshWidget her zaman BUGÜNÜ hesaplar (selectedDate değil).
    refreshWidget(user.id);
  };

  const adjustHabit = (h: HabitView, delta: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, delta, h.target);
    tapLight();
    reload();
    refreshWidget(user.id);
  };

  // Klavyeden girilen mutlak değer — mevcut delta tabanlı incrementAmount'a
  // fark hesaplanarak devredilir, ayrı bir repo fonksiyonu gerekmez.
  const setHabitAmount = (h: HabitView, value: number) => {
    if (isFuture) return;
    habitRepo.incrementAmount(h.id, selectedDate, value - h.amount, h.target);
    reload();
    refreshWidget(user.id);
  };

  const onPickDate = (picked: Date) => setSelectedDate(toYmd(picked));

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

        <DatePickerModal
          visible={showPicker}
          value={new Date(`${selectedDate}T00:00:00`)}
          onClose={() => setShowPicker(false)}
          onConfirm={onPickDate}
        />

        {/* Günün ilerleme özeti — yalnızca bugün için anlamlı. */}
        {isToday && (
          <DailySummary
            habitsDone={habitsDone}
            habitsTotal={habits.length}
            tasksDone={tasksDone}
            tasksTotal={tasks.length}
          />
        )}

        {/* Tür filtresi — yalnızca liste görünümünü daraltır. "Tamamlananları
            gizle" artık kalıcı bir tercih olarak Profil'de ayarlanır. */}
        {!dayIsEmpty && (
          <View style={styles.filterRow}>
            {(['all', 'task', 'habit'] as const).map((f) => {
              const active = typeFilter === f;
              const label =
                f === 'all' ? tr('today.filterAll') : f === 'task' ? tr('tabs.tasks') : tr('tabs.habits');
              return (
                <Pressable
                  key={f}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setTypeFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Görevler ve alışkanlıklar tek liste halinde, ayrı başlık olmadan.
            Görevde öncelik noktası, alışkanlıkta 🔥 seri ayırt edici işaret. */}
        <View style={styles.list}>
          {dayIsEmpty ? (
            <EmptyState
              emoji={isToday ? '🎉' : '🌙'}
              title={isToday ? tr('empty.todayTitle') : tr('empty.otherDayTitle')}
              subtitle={isToday ? tr('empty.todayBody') : undefined}
            />
          ) : filterHidesEverything ? (
            <EmptyState emoji="🔍" title={tr('today.filterEmpty')} />
          ) : (
            <>
              {filteredTasks.map((t) => {
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
                      {(t.recurrence || subtaskCounts[t.id]) && (
                        <Text style={styles.subCount}>
                          {[
                            t.recurrence
                              ? `🔁 ${scheduleLabel(t.recurrence, schedLabels)}`
                              : null,
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
              })}

              {filteredHabits.map((h) =>
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
                      onSet={(v) => setHabitAmount(h, v)}
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
                    {/* Kota alışkanlığı: haftalık ilerleme ("2/3"). Seri hafta
                        bazında olduğundan madalya eşiği hafta×7 ile ölçeklenir. */}
                    {h.weekQuota && (
                      <Text style={styles.quotaChip}>
                        {h.weekQuota.done}/{h.weekQuota.target}
                      </Text>
                    )}
                    {h.streak > 0 && (
                      <Text style={shared.streak}>
                        {highestMilestone(h.weekQuota ? h.streak * 7 : h.streak)?.emoji ?? '🔥'} {h.streak}
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
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    filterChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterChipText: { fontSize: 13, fontWeight: '600', color: c.muted },
    filterChipTextActive: { color: c.onAccent },
    list: { marginTop: 16 },
    subCount: { fontSize: 12, color: c.muted, marginTop: 3 },
    // Kota alışkanlığının "2/3" haftalık ilerleme göstergesi (kartın sağında).
    quotaChip: {
      fontSize: 13,
      fontWeight: '800',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginRight: 8,
      overflow: 'hidden',
    },
  });
