// "Hedefler" sekmesi — iki tip hedef:
//  - numeric: ilerleme çubuğu + artır/azalt (örn. 40/100 km)
//  - milestone: adımlara bölünebilir (görev/alt görev mantığı) — kart üzerinden
//    elle işaretlenir; tüm adımlar tamamlanınca (varsa) otomatik tamamlanır.
// Her iki tipte de artık bir son tarih var (zorunlu, GoalForm'da ayarlanır).
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır (form AddSheet'te).
// Mimari kural: SQL yok; yalnızca goalRepo/goalMilestoneRepo çağrılır.

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { goalMilestoneRepo, goalRepo } from '@/db';
import type { Goal } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { useAppData } from '@/ui/AppData';
import { EmptyState } from '@/ui/EmptyState';
import { GoalEditModal } from '@/ui/GoalEditModal';
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
  const [editing, setEditing] = useState<Goal | null>(null); // null = panel kapalı
  // Aynı anda yalnızca bir kartın swipe aksiyonları açık kalsın.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const reload = useCallback(() => {
    const list = goalRepo.listByUser(user.id);
    setGoals(list);
    const milestoneGoalIds = list.filter((g) => g.goal_type === 'milestone').map((g) => g.id);
    setMilestoneCounts(goalMilestoneRepo.countsForGoals(milestoneGoalIds));
    // dataVersion: ＋ menüsünden hedef eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

  const step = (id: string, amount: number) => {
    goalRepo.addProgress(id, amount);
    // Hedefe ulaşıldıysa başarı titreşimi; yoksa hafif dokunuş.
    const g = goalRepo.getById(id);
    g && goalRepo.progressRatio(g) >= 1 ? notifySuccess() : tapLight();
    reload();
  };

  // Yalnızca 'milestone' hedeflerde anlamlı — kart üzerindeki elle işaretleme.
  // Adımlar varsa GoalEditModal'daki otomatik tamamlamayla senkron kalır (biri
  // diğerini ezmez, tıpkı görev/alt görev ilişkisindeki gibi).
  const toggleCompleted = (goal: Goal) => {
    const completing = goal.completed_at === null;
    goalRepo.setCompleted(goal.id, completing);
    completing ? notifySuccess() : tapLight();
    reload();
  };

  // Silme onayı artık SwipeableRow'un kendi iki-dokunuşluk aksiyon düğmesinde
  // (sağa açılan panel) — burada doğrudan siliniyor.
  const remove = (id: string) => {
    goalRepo.softDelete(id);
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
                onEdit={() => setEditing(goal)}
                onDelete={() => remove(goal.id)}
                editA11yLabel={t('common.editA11y', { title: goal.title })}
                deleteA11yLabel={t('common.deleteA11y', { title: goal.title })}
              >
              {/* marginBottom kaldırıldı (0) — bkz. tasks.tsx'teki aynı düzeltme yorumu. */}
              <View style={[styles.goalCard, styles.noMargin]}>
                <View style={styles.goalHead}>
                  {goal.goal_type === 'milestone' && (
                    <Pressable
                      onPress={() => toggleCompleted(goal)}
                      hitSlop={8}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: completed }}
                      accessibilityLabel={goal.title}
                    >
                      <View style={[styles.checkbox, completed && styles.checkboxDone]}>
                        {completed && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </Pressable>
                  )}
                  {/* Başlığa dokununca düzenleme paneli açılır */}
                  <Pressable style={styles.titleArea} onPress={() => setEditing(goal)}>
                    <Text style={[styles.goalTitle, completed && styles.goalTitleDone]}>{goal.title}</Text>
                  </Pressable>
                </View>

                {goal.goal_type === 'numeric' ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
                    </View>
                    <View style={styles.goalFoot}>
                      <Text style={styles.goalMeta}>
                        {goal.current_value}
                        {goal.target_value != null ? ` / ${goal.target_value}` : ''}
                        {goal.unit ? ` ${goal.unit}` : ''}
                      </Text>
                      <View style={styles.steppers}>
                        <Pressable style={styles.stepBtn} onPress={() => step(goal.id, -1)}>
                          <Text style={styles.stepText}>−1</Text>
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => step(goal.id, 1)}>
                          <Text style={styles.stepText}>+1</Text>
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => step(goal.id, 5)}>
                          <Text style={styles.stepText}>+5</Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : (
                  counts && counts.total > 0 && (
                    <Text style={[styles.goalMeta, styles.standaloneMeta]}>
                      {counts.done}/{counts.total} {t('goal.milestoneCountSuffix')}
                    </Text>
                  )
                )}
                {!!dLabel && <Text style={styles.deadlineLeft}>{dLabel}</Text>}
              </View>
              </SwipeableRow>
              </View>
            );
          })
        )}
      </ScrollView>

      <GoalEditModal
        goal={editing}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
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
      padding: 16,
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
      height: 10,
      borderRadius: 5,
      backgroundColor: c.track,
      marginTop: 14,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    goalFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    goalMeta: { fontSize: 14, color: c.muted, fontWeight: '600' },
    standaloneMeta: { marginTop: 12 },
    steppers: { flexDirection: 'row', gap: 6 },
    stepBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
    },
    stepText: { fontSize: 14, fontWeight: '700', color: c.primary },
    deadlineLeft: { fontSize: 12, color: c.streak, fontWeight: '700', marginTop: 8 },
  });
