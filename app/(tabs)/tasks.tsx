// "Görevler" sekmesi — yalnızca bugün değil, TÜM aktif görevler.
// "Bugün" ekranından farkı: tarihi ileride olan ya da tarihsiz görevler de burada
// görünür. Tamamlananlar listenin altına iner. Göreve dokununca düzenleme paneli.
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır.
// Mimari kural: SQL yok; yalnızca taskRepo çağrılır.
//
// SANALLAŞTIRMA (denetim bulgusu, P2): liste eskiden ScrollView + .map() ile
// çiziliyordu, yani HER görev aynı anda mount ediliyordu — her biri kendi
// PanResponder'ı olan bir SwipeableRow. Tamamlanan görev listeden hiç düşmediği
// için bir yıl kullanan birinde bu binlerce bileşen demekti: sekmeye her girişte
// JS thread'i kilitleniyor, bellek sürekli büyüyordu. Artık FlatList yalnız
// görünen satırları mount ediyor; ayrıca SORGU da sınırlı (bkz. taskRepo.
// listForScreen) — eski tamamlananlar istenirse tek dokunuşla açılıyor.

import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { reminderRepo, subtaskRepo, taskRepo } from '@/db';
import type { Task } from '@/db';
import { buildScheduleLabels, extractTime, scheduleLabel, todayDate, toYmd } from '@/lib/helpers';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { cancelTaskReminders, refreshTaskReminders } from '@/lib/notifications';
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

// Tamamlanan görevlerin varsayılan görünme penceresi. "Dün ne yapmıştım"
// sorusuna cevap verecek kadar uzun, listeyi arşive çevirmeyecek kadar kısa.
const COMPLETED_WINDOW_DAYS = 30;

function shiftDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

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
  // Varsayılan olarak yalnız SON GÜNLERDE tamamlananlar listelenir; kullanıcı
  // isterse hepsini açar (oturum boyunca açık kalır).
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [olderCompletedCount, setOlderCompletedCount] = useState(0);

  const reload = useCallback(() => {
    // Sıralama (tamamlananlar dibe) artık SQL'de — JS tarafında ayrıca sort
    // etmeye gerek yok.
    const since = showAllCompleted ? null : shiftDays(todayDate(), -COMPLETED_WINDOW_DAYS);
    const list = taskRepo.listForScreen(user.id, since);
    setTasks(list);
    setOlderCompletedCount(since ? taskRepo.countCompletedBefore(user.id, since) : 0);
    // Alt görev rozet sayıları tek sorguda (N+1 yerine); alt görevsiz görevler
    // sonuçta yer almaz.
    setSubtaskCounts(subtaskRepo.countsForTasks(list.map((t) => t.id)));
    // dataVersion: ＋ menüsünden görev eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion, showAllCompleted]);

  useFocusEffect(reload);

  const remaining = useMemo(() => tasks.filter((t) => t.completed_at === null).length, [tasks]);

  // Tekrarlayan görev rozeti ("🔁 Her gün / Pzt·Çar·Cum / Her yıl: ...") için
  // etiket seti (bkz. helpers.buildScheduleLabels).
  const schedLabels = buildScheduleLabels(tr, (md) => shortDate(`2000-${md}`, lang));

  const toggleTask = (t: Task) => {
    const completing = t.completed_at === null;
    taskRepo.setCompleted(t.id, completing);
    completing ? notifySuccess() : tapLight();
    // Tekrarlayan görev "tamamla"da tamamlanmak yerine bir sonraki tarihe ileri
    // sarabilir (hâlâ tamamlanmamış, yeni tarihli) — karar güncel DB durumuna
    // bakılarak verilir (bkz. refreshTaskReminders).
    refreshTaskReminders(t.id);
    // Yeniden sırala (tamamlanan alta iner); her kart Animated.View + LinearTransition
    // olduğu için konum değişimi yumuşakça animasyonlanır (Fabric'te de çalışır).
    reload();
  };

  const removeTask = (t: Task) => {
    taskRepo.softDelete(t.id);
    cancelTaskReminders(t.id).catch((e) =>
      console.warn('[Bildirim] Silinen görevin hatırlatmaları iptal edilemedi:', e)
    );
    reload();
  };

  const renderItem = useCallback(
    ({ item: t, index: i }: { item: Task; index: number }) => {
      const done = t.completed_at !== null;
      const time = extractTime(t.due_date);
      return (
        <Animated.View
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
                        ? `🔁 ${scheduleLabel(t.recurrence, schedLabels)}`
                        : null,
                      t.due_date && !done ? shortDate(t.due_date, lang) : null,
                      subtaskCounts[t.id]
                        ? `${subtaskCounts[t.id].done}/${subtaskCounts[t.id].total} ${tr('task.subtaskCountSuffix', { n: subtaskCounts[t.id].total })}`
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
    },
    // openRowId/subtaskCounts değişince satırlar yeniden çizilmeli; bu yüzden
    // bağımlılıkta duruyorlar (FlatList extraData ile birlikte).
    [openRowId, subtaskCounts, schedLabels, styles, shared, lang, tr]
  );

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <FlatList
        data={tasks}
        renderItem={renderItem}
        keyExtractor={(t) => t.id}
        // Satır görünümü liste dışı duruma da bağlı (açık swipe, alt görev
        // rozetleri) — FlatList bunları bilmediğinden açıkça bildiriyoruz.
        extraData={`${openRowId}|${tasks.length}`}
        contentContainerStyle={shared.content}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={shared.headerRow}>
              <Text style={shared.greeting}>{tr('tabs.tasks')}</Text>
              <ProfileButton />
            </View>
            <Text style={shared.subtitle}>{tr('screen.tasksSubtitle', { n: remaining })}</Text>
          </>
        }
        ListEmptyComponent={
          <EmptyState emoji="📝" title={tr('empty.tasksTitle')} subtitle={tr('empty.tasksBody')} />
        }
        ListFooterComponent={
          // Gizlenen eski tamamlananlar varsa tek dokunuşla açılır. Düğme yalnız
          // gerçekten gizlenen bir şey varken görünür — boş bir vaat vermez.
          olderCompletedCount > 0 ? (
            <Pressable
              style={styles.showOlderBtn}
              onPress={() => setShowAllCompleted(true)}
              accessibilityRole="button"
              accessibilityLabel={tr('tasks.showOlderCompleted', { n: olderCompletedCount })}
            >
              <Text style={styles.showOlderText}>
                {tr('tasks.showOlderCompleted', { n: olderCompletedCount })}
              </Text>
            </Pressable>
          ) : null
        }
      />

      <TaskEditModal task={editingTask} onClose={() => setEditingTask(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    due: { fontSize: 12, color: c.muted, marginTop: 3 },
    rowSpacing: { marginBottom: 8 },
    noMargin: { marginBottom: 0 },
    showOlderBtn: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
    showOlderText: { fontSize: 14, fontWeight: '600', color: c.primary },
  });
