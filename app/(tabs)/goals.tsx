// "Hedefler" sekmesi — iki tip hedef:
//  - numeric: ilerleme çubuğu (örn. 40/100 km)
//  - milestone: adımlara bölünebilir (görev/alt görev mantığı) — tüm adımlar
//    tamamlanınca (varsa) otomatik tamamlanır.
// Her iki tipte de artık bir son tarih var (zorunlu, GoalForm'da ayarlanır) ve
// isteğe bağlı adımlar (goal_milestones) olabilir — yalnızca 'milestone' tipte
// zorunlu değil, 'numeric' hedefe de opsiyonel checklist olarak eklenebilir.
// Liste SALT-OKUNUR bir özet/gezinme yüzeyi: ilerleme girişi (numeric stepper),
// tamamlandı işaretleme (milestone) ve adım ekleme artık burada değil — hepsi
// /goal/[id] ekranının 'Genel'/'Adımlar' sekmelerinde ("entry" tek yerde).
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır (form AddSheet'te).
// Mimari kural: SQL yok; yalnızca goalRepo/goalMilestoneRepo çağrılır.

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { goalMilestoneRepo, goalRepo, milestoneViews } from '@/db';
import type { Goal } from '@/db';
import { fmtClock, isTimeUnit } from '@/lib/helpers';
import { cancelGoalReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { ProfileButton } from '@/ui/ProfileButton';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, type Colors } from '@/ui/theme';

export default function GoalsScreen() {
  const { colors, shared } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user, dataVersion } = useAppData();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestoneCounts, setMilestoneCounts] = useState<Record<string, { done: number; total: number }>>({});
  // Aynı anda yalnızca bir kartın swipe aksiyonları açık kalsın.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  // Düzenleme artık ayrı bir modal değil — /goal/[id] ekranının 'edit' sekmesi
  // (bkz. app/goal/[id].tsx). Stats ikonu aynı ekranı 'stats' sekmesiyle açar.
  const openGoal = (id: string, tab: 'stats' | 'edit') =>
    router.push({ pathname: '/goal/[id]', params: { id, tab } });

  const reload = useCallback(() => {
    const list = goalRepo.listByUser(user.id);
    setGoals(list);
    // Adım rozetleri görünümlerden türetilir: miktarlı (ara-eşik) adımın "done"
    // durumu completed kolonunda DEĞİL, hedefin current_value'sundadır (bkz.
    // milestoneViews). Hedef sayısı küçük — hedef başına sorgu kabul edilir
    // (useGoalStats.linkedHabits'teki aynı gerekçe).
    const counts: Record<string, { done: number; total: number }> = {};
    for (const g of list) {
      const views = milestoneViews(goalMilestoneRepo.listByGoal(g.id), g.current_value);
      if (views.length > 0) {
        counts[g.id] = { done: views.filter((v) => v.reached).length, total: views.length };
      }
    }
    setMilestoneCounts(counts);
    // dataVersion: ＋ menüsünden hedef eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

  // Silme onayı artık SwipeableRow'un kendi iki-dokunuşluk aksiyon düğmesinde
  // (sağa açılan panel) — burada doğrudan siliniyor.
  const remove = (id: string) => {
    goalRepo.softDelete(id);
    cancelGoalReminders(id).catch(() => {});
    reload();
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{t('tabs.goals')}</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>{t('screen.goalsSubtitle')}</Text>

        {/* LİSTE */}
        {goals.length === 0 ? (
          <EmptyState
            emoji="🎯"
            title={t('empty.goalsTitle')}
            subtitle={t('empty.goalsBody')}
          />
        ) : (
          goals.map((goal, i) => {
            const ratio = goalRepo.progressRatio(goal);
            const completed = goalRepo.isCompleted(goal);
            const counts = milestoneCounts[goal.id];
            const dLabel = deadlineLabel(goal.deadline, {
              daysLeft: (n) => t('date.daysLeft', { n }),
              dueToday: t('date.dueToday'),
              daysAgo: (n) => t('date.daysAgo', { n }),
            });
            return (
              <View key={goal.id} style={[styles.rowSpacing, i === 0 && { marginTop: 20 }]}>
              <SwipeableRow
                isOpen={openRowId === goal.id}
                onOpenChange={(open) => setOpenRowId(open ? goal.id : null)}
                onEdit={() => openGoal(goal.id, 'edit')}
                onDelete={() => remove(goal.id)}
                editA11yLabel={t('common.editA11y', { title: goal.title })}
                deleteA11yLabel={t('common.deleteA11y', { title: goal.title })}
              >
              {/* marginBottom kaldırıldı (0) — bkz. tasks.tsx'teki aynı düzeltme yorumu. */}
              <View style={[styles.goalCard, styles.noMargin]}>
                <View style={styles.goalHead}>
                  {/* Salt-okunur durum göstergesi — işaretleme artık /goal/[id]'nin
                      Genel sekmesinde (bkz. dosya başı yorumu). */}
                  {goal.goal_type === 'milestone' && (
                    <View style={[styles.checkbox, completed && styles.checkboxDone]}>
                      {completed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  )}
                  {/* Başlığa dokununca hedef ekranı 'Düzenle' sekmesiyle açılır */}
                  <Pressable style={styles.titleArea} onPress={() => openGoal(goal.id, 'edit')}>
                    <Text style={[styles.goalTitle, completed && styles.goalTitleDone]}>{goal.title}</Text>
                  </Pressable>
                  {/* İkona dokununca aynı ekran 'İstatistik' sekmesiyle açılır (bkz. habits.tsx'teki hafta şeridi) */}
                  <Pressable
                    onPress={() => openGoal(goal.id, 'stats')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.statsA11y', { title: goal.title })}
                  >
                    <Feather name="bar-chart-2" size={18} color={colors.faint} />
                  </Pressable>
                </View>

                {goal.goal_type === 'numeric' && (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
                    </View>
                    <Text style={[styles.goalMeta, styles.standaloneMeta]}>
                      {isTimeUnit(goal.unit)
                        ? `${fmtClock(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtClock(goal.target_value)}` : ''
                          }`
                        : `${goal.current_value}${
                            goal.target_value != null ? ` / ${goal.target_value}` : ''
                          }${goal.unit ? ` ${goal.unit}` : ''}`}
                    </Text>
                  </>
                )}
                {/* Adım rozeti artık her iki tipte de görünebilir — 'numeric' hedefe de
                    opsiyonel adım eklenebiliyor (bkz. dosya başı yorumu). */}
                {counts && counts.total > 0 && (
                  <Text style={[styles.goalMeta, styles.standaloneMeta]}>
                    {counts.done}/{counts.total} {t('goal.milestoneCountSuffix')}
                  </Text>
                )}
                {/* Son tarih artık kartın sağ alt köşesinde küçük bir rozet gibi. */}
                {!!dLabel && (
                  <View style={styles.deadlineRow}>
                    <Text style={styles.deadlineLeft}>{dLabel}</Text>
                  </View>
                )}
              </View>
              </SwipeableRow>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    goalCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 13,
      marginBottom: 10, // noMargin ile ezilir (bkz. rowSpacing); dış sarmalayıcıya taşındı
    },
    goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxDone: { backgroundColor: c.done, borderColor: c.done },
    checkmark: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    titleArea: { flex: 1 },
    goalTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    goalTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    rowSpacing: { marginBottom: 10 },
    noMargin: { marginBottom: 0 },

    progressTrack: {
      height: 9,
      borderRadius: 5,
      backgroundColor: c.track,
      marginTop: 10,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    goalMeta: { fontSize: 14, color: c.muted, fontWeight: '600' },
    standaloneMeta: { marginTop: 8 },
    // Son tarih — sağ alt köşede küçük bir rozet.
    deadlineRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
    deadlineLeft: { fontSize: 11, color: c.streak, fontWeight: '700' },
  });
