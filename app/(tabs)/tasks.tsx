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
import { extractTime, scheduleLabel } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminder, scheduleTaskReminder } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { PriorityMark } from '@/ui/PriorityMark';
import { ProfileButton } from '@/ui/ProfileButton';
import { SwipeableRow } from '@/ui/SwipeableRow';
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
  // Aynı anda yalnızca bir kartın swipe aksiyonları açık kalsın.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // Görev kartındaki "1/3 alt görev" rozeti; yalnızca alt görevi olanlar girer.
  const [subtaskCounts, setSubtaskCounts] = useState<
    Record<string, { done: number; total: number }>
  >({});

  const reload = useCallback(() => {
    // Tamamlanmamışlar üstte, tamamlananlar altta.
    const all = taskRepo.listByUser(user.id);
    all.sort((a, b) => Number(a.completed_at !== null) - Number(b.completed_at !== null));
    setTasks(all);
    // Alt görev rozet sayıları tek sorguda (N+1 yerine); alt görevsiz görevler
    // sonuçta yer almaz.
    setSubtaskCounts(subtaskRepo.countsForTasks(all.map((t) => t.id)));
    // dataVersion: ＋ menüsünden görev eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  // Tekrarlayan görev rozeti ("🔁 Her gün / Pzt·Çar·Cum") için gün etiketleri
  // (JS getDay sırasıyla, 0=Pazar) — scheduleLabel ile birleştirilir.
  const dayLabels = [
    tr('weekday.sun'), tr('weekday.mon'), tr('weekday.tue'), tr('weekday.wed'),
    tr('weekday.thu'), tr('weekday.fri'), tr('weekday.sat'),
  ];

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // Tekrarlayan görev "tamamla"da tamamlanmak yerine bir sonraki tarihe ileri
    // sarabilir (hâlâ tamamlanmamış, yeni tarihli). Güncel duruma göre karar
    // ver: tamamlanmamışsa hatırlatmayı yeni değere göre kur, tamamlandıysa iptal.
    const after = taskRepo.getById(t.id);
    if (after && after.completed_at === null) scheduleTaskReminder(after);
    else cancelTaskReminder(t.id);
    // Yeniden sırala (tamamlanan alta iner); her kart Animated.View + LinearTransition
    // olduğu için konum değişimi yumuşakça animasyonlanır (Fabric'te de çalışır).
    reload();
  };

  const removeTask = (t: Task) => {
    taskRepo.softDelete(t.id);
    cancelTaskReminder(t.id);
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
                style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}
              >
                <SwipeableRow
                  isOpen={openRowId === t.id}
                  onOpenChange={(open) => setOpenRowId(open ? t.id : null)}
                  onEdit={() => setEditingTask(t)}
                  onDelete={() => removeTask(t)}
                  editA11yLabel={tr('common.editA11y', { title: t.title })}
                  deleteA11yLabel={tr('common.deleteA11y', { title: t.title })}
                >
                  {/* marginBottom kaldırıldı (0) — shared.card'daki alt boşluk
                      artık dış sarmalayıcıda (rowSpacing); yoksa kartın kendi
                      boyanmamış marj payını aksiyon paneli renkle doldurup
                      kartın hemen altında ince bir şerit olarak sızdırıyordu. */}
                  <View style={[shared.card, styles.noMargin]}>
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
                      {((t.due_date && !done) || subtaskCounts[t.id] || t.recurrence) && (
                        <Text style={styles.due}>
                          {[
                            t.recurrence
                              ? `🔁 ${scheduleLabel(t.recurrence, tr('habit.everyDay'), dayLabels)}`
                              : null,
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
                  </View>
                </SwipeableRow>
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
    rowSpacing: { marginBottom: 8 },
    noMargin: { marginBottom: 0 },
  });
