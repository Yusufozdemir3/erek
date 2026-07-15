// Hedef DETAY ekranı — sekmeli: Genel · İstatistik · Adımlar · Düzenle.
// Eskiden düzenleme ayrı bir modalda (GoalEditModal) açılıyordu; artık bu
// ekranın bir sekmesi — tek doğru kaynak/tek yer, bakım maliyeti düşük.
// Adımlar (goal_milestones) artık HER İKİ hedef tipinde de opsiyonel bir
// checklist olarak eklenebilir — 'milestone' tipte otomatik tamamlama
// mantığını sürdürür, 'numeric' tipte salt organizasyonel bir yardımcıdır
// (numeric hedefin tamamlanması hep current_value>=target_value'dan gelir).
// Tüm veri GİRİŞİ ("entry") Genel sekmesinde yapılır: numeric hedefte
// +1/+5/−1 sayacı, milestone hedefte elle tamamlandı işaretleme — liste
// ekranı (goals.tsx) artık salt-okunur bir özet/gezinme yüzeyi.
// "Hedefler" sekmesinden üç şekilde açılır: başlığa dokun (edit sekmesi), swipe
// düzenle (edit sekmesi), 📊 ikonu (stats sekmesi); yoksa varsayılan Genel'dir.
// Mimari kural: SQL yok; yalnızca useGoalStats + goalRepo/goalMilestoneRepo çağrılır.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goalMilestoneRepo, goalRepo } from '@/db';
import type { GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { useGoalStats, type LinkedHabit } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DEFAULT_HABIT_COLOR, deadlineLabel, shortDate, type Colors } from '@/ui/theme';

type Styles = ReturnType<typeof makeStyles>;
type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

// Tam sayıysa ondalık gösterme, değilse 1 ondalık (AmountStepper'daki fmt ile aynı desen).
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function StatCard({
  label,
  value,
  accent,
  styles,
}: {
  label: string;
  value: string;
  accent?: 'danger' | 'primary';
  styles: Styles;
}) {
  return (
    <View style={styles.statCard}>
      <Text
        style={[
          styles.statValue,
          accent === 'danger' && styles.statValueDanger,
          accent === 'primary' && styles.statValuePrimary,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkedHabitRow({ habit, styles }: { habit: LinkedHabit; styles: Styles }) {
  const color = habit.color ?? DEFAULT_HABIT_COLOR;
  return (
    <Pressable
      style={styles.habitRow}
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      accessibilityRole="button"
    >
      <View style={[styles.habitDot, { backgroundColor: color + '22', borderColor: color }]}>
        {habit.icon ? <Text style={styles.habitIconText}>{habit.icon}</Text> : null}
      </View>
      <Text style={styles.habitTitle} numberOfLines={1}>
        {habit.title}
      </Text>
      <Text style={styles.habitChevron}>›</Text>
    </Pressable>
  );
}

export default function GoalDetailScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: GoalTab }>();
  const stats = useGoalStats(id);
  const [activeTab, setActiveTab] = useState<GoalTab>((tab as GoalTab) || 'overview');
  const [newMilestone, setNewMilestone] = useState('');

  const goal = stats.goal;

  // — Genel sekmesi: veri girişi ("entry") —
  const adjustProgress = (amount: number) => {
    if (!goal) return;
    goalRepo.addProgress(goal.id, amount);
    const g = goalRepo.getById(goal.id);
    g && goalRepo.progressRatio(g) >= 1 ? notifySuccess() : tapLight();
    stats.reload();
  };
  const toggleGoalCompleted = () => {
    if (!goal) return;
    const completing = goal.completed_at === null;
    goalRepo.setCompleted(goal.id, completing);
    completing ? notifySuccess() : tapLight();
    stats.reload();
  };

  // — Adımlar sekmesi: mutasyonlar (eskiden GoalEditModal'da) —
  const syncGoalCompletion = () => {
    if (!goal) return;
    const { done, total } = goalMilestoneRepo.countForGoal(goal.id);
    if (total === 0) return;
    const current = goalRepo.getById(goal.id);
    if (!current) return;
    const shouldBeCompleted = done === total;
    const isCompleted = current.completed_at !== null;
    if (shouldBeCompleted && !isCompleted) {
      goalRepo.setCompleted(goal.id, true);
      notifySuccess();
    } else if (!shouldBeCompleted && isCompleted) {
      goalRepo.setCompleted(goal.id, false);
      tapLight();
    }
  };
  const refreshMilestones = () => {
    syncGoalCompletion();
    stats.reload();
  };
  const addMilestone = () => {
    const v = newMilestone.trim();
    if (!v || !goal) return;
    goalMilestoneRepo.create(goal.id, v);
    setNewMilestone('');
    refreshMilestones();
  };
  const toggleMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.setCompleted(m.id, m.completed === 0);
    refreshMilestones();
  };
  const removeMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.softDelete(m.id);
    refreshMilestones();
  };

  // — Düzenle sekmesi —
  const handleEditSubmit = (values: GoalFormValues) => {
    if (!goal) return;
    goalRepo.update(goal.id, {
      title: values.title,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      ...(values.current_value != null ? { current_value: values.current_value } : {}),
    });
    stats.reload();
    setActiveTab('overview');
  };
  const handleDelete = () => {
    if (!goal) return;
    goalRepo.softDelete(goal.id);
    router.back();
  };

  // Adımlar sekmesi artık her iki hedef tipinde de var (bkz. dosya başı yorumu).
  const TABS: { key: GoalTab; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: 'overview', labelKey: 'goal.tabOverview', icon: 'home' },
    { key: 'stats', labelKey: 'goal.tabStats', icon: 'bar-chart-2' },
    { key: 'milestones', labelKey: 'goal.milestones', icon: 'check-square' },
    { key: 'edit', labelKey: 'goal.tabEdit', icon: 'edit-2' },
  ];

  const dLabel = deadlineLabel(goal?.deadline ?? null, {
    daysLeft: (n) => t('date.daysLeft', { n }),
    dueToday: t('date.dueToday'),
    daysAgo: (n) => t('date.daysAgo', { n }),
  });

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!goal ? (
          <Text style={shared.empty}>{t('goalStats.notFound')}</Text>
        ) : (
          <>
            <Text style={shared.greeting}>{goal.title}</Text>

            {/* Sekme çubuğu */}
            <View style={styles.tabBar}>
              {TABS.map((tb) => {
                const active = activeTab === tb.key;
                return (
                  <Pressable
                    key={tb.key}
                    style={[styles.tabBtn, active && styles.tabBtnActive]}
                    onPress={() => setActiveTab(tb.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={tb.icon} size={15} color={active ? colors.primary : colors.faint} />
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t(tb.labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* — GENEL — */}
            {activeTab === 'overview' && (
              <View>
                {stats.completed && (
                  <View style={styles.completedBanner}>
                    <Text style={styles.completedBannerText}>{t('goalStats.completed')}</Text>
                  </View>
                )}

                {goal.goal_type === 'numeric' ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.round(stats.ratio * 100)}%` }]} />
                    </View>
                    <View style={styles.entryRow}>
                      <Text style={styles.overviewLine}>
                        {fmtAmount(goal.current_value)}
                        {goal.target_value != null ? ` / ${fmtAmount(goal.target_value)}` : ''}
                        {goal.unit ? ` ${goal.unit}` : ''}
                      </Text>
                      {/* Veri girişi burada — bkz. dosya başı yorumu. */}
                      <View style={styles.steppers}>
                        <Pressable style={styles.stepBtn} onPress={() => adjustProgress(-1)}>
                          <Text style={styles.stepText}>−1</Text>
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => adjustProgress(1)}>
                          <Text style={styles.stepText}>+1</Text>
                        </Pressable>
                        <Pressable style={styles.stepBtn} onPress={() => adjustProgress(5)}>
                          <Text style={styles.stepText}>+5</Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.entryRow}>
                    <Text style={styles.overviewLine}>
                      {stats.milestonesDone}/{stats.milestonesTotal} {t('goal.milestoneCountSuffix')}
                    </Text>
                    {/* Elle tamamlandı işaretleme — adımlar varsa Adımlar sekmesiyle senkron kalır. */}
                    <Pressable
                      style={[styles.completeToggleBtn, stats.completed && styles.completeToggleBtnDone]}
                      onPress={toggleGoalCompleted}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: stats.completed }}
                    >
                      <Text style={[styles.completeToggleText, stats.completed && styles.completeToggleTextDone]}>
                        {stats.completed ? t('goal.markIncomplete') : t('goal.markComplete')}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {!!dLabel && <Text style={styles.deadlineLine}>{dLabel}</Text>}

                {stats.linkedHabits.length > 0 && (
                  <>
                    <Text style={[shared.subtitle, styles.sectionTitle]}>{t('goalStats.linkedHabits')}</Text>
                    <View style={styles.card}>
                      {stats.linkedHabits.map((h, i) => (
                        <View key={h.id} style={i > 0 && styles.habitRowDivider}>
                          <LinkedHabitRow habit={h} styles={styles} />
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* — İSTATİSTİK — sayı+etiket kartları, cümle değil */}
            {activeTab === 'stats' && (
              <View style={styles.statsGrid}>
                {goal.goal_type === 'numeric' && (
                  <>
                    <StatCard label={t('goal.statRatio')} value={`%${Math.round(stats.ratio * 100)}`} styles={styles} />
                    <StatCard
                      label={t('goal.statRemaining')}
                      value={
                        stats.remaining != null
                          ? `${fmtAmount(stats.remaining)}${goal.unit ? ` ${goal.unit}` : ''}`
                          : '–'
                      }
                      styles={styles}
                    />
                  </>
                )}

                <StatCard
                  label={t('goal.statDeadline')}
                  value={goal.deadline ? shortDate(goal.deadline, lang) : '–'}
                  styles={styles}
                />

                {stats.isOverdue ? (
                  <StatCard
                    label={t('goalStats.overdueDaysLabel')}
                    value={String(stats.overdueDays)}
                    accent="danger"
                    styles={styles}
                  />
                ) : stats.daysLeft != null ? (
                  <StatCard label={t('goalStats.daysLeftLabel')} value={String(stats.daysLeft)} styles={styles} />
                ) : null}

                {goal.goal_type === 'numeric' && stats.dailyPace != null && (
                  <>
                    <StatCard
                      label={t('goalStats.dailyPaceLabel')}
                      value={`${fmtAmount(stats.dailyPace)}${goal.unit ? ` ${goal.unit}` : ''}`}
                      accent="primary"
                      styles={styles}
                    />
                    <StatCard
                      label={t('goalStats.weeklyPaceLabel')}
                      value={`${fmtAmount(stats.weeklyPace!)}${goal.unit ? ` ${goal.unit}` : ''}`}
                      styles={styles}
                    />
                    <StatCard
                      label={t('goalStats.monthlyPaceLabel')}
                      value={`${fmtAmount(stats.monthlyPace!)}${goal.unit ? ` ${goal.unit}` : ''}`}
                      styles={styles}
                    />
                  </>
                )}

                {/* Adım tabanlı kartlar — adımı olan HER hedefte görünür, tipe bakılmaksızın
                    (bkz. dosya başı yorumu: 'numeric' hedefe de opsiyonel checklist eklenebilir). */}
                {stats.milestonesTotal > 0 && (
                  <>
                    <StatCard
                      label={t('goalStats.milestonesRemainingLabel')}
                      value={String(stats.milestonesRemaining)}
                      styles={styles}
                    />
                    {stats.milestonePaceDays != null && (
                      <>
                        <StatCard
                          label={t('goalStats.milestonePaceLabel')}
                          value={fmtAmount(stats.milestonePaceDays)}
                          accent="primary"
                          styles={styles}
                        />
                        <StatCard
                          label={t('goalStats.milestoneWeeklyLabel')}
                          value={fmtAmount(stats.milestoneWeeklyPace!)}
                          styles={styles}
                        />
                      </>
                    )}
                  </>
                )}

                {!goal.deadline && <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>}
              </View>
            )}

            {/* — ADIMLAR — her iki tipte de kullanılabilir; anında yazılır (subtask deseni) */}
            {activeTab === 'milestones' && (
              <View>
                {stats.milestones.map((m) => {
                  const done = m.completed === 1;
                  return (
                    <View key={m.id} style={styles.milestoneRow}>
                      <Pressable
                        onPress={() => toggleMilestone(m)}
                        hitSlop={8}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        accessibilityLabel={m.title}
                      >
                        <View style={[styles.milestoneBox, done && styles.milestoneBoxDone]}>
                          {done && <Text style={styles.milestoneCheck}>✓</Text>}
                        </View>
                      </Pressable>
                      <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>{m.title}</Text>
                      <Pressable onPress={() => removeMilestone(m)} hitSlop={10}>
                        <Text style={styles.milestoneDelete}>×</Text>
                      </Pressable>
                    </View>
                  );
                })}
                <View style={styles.milestoneAddRow}>
                  <TextInput
                    style={styles.milestoneInput}
                    value={newMilestone}
                    onChangeText={setNewMilestone}
                    placeholder={t('goal.addMilestone')}
                    placeholderTextColor={colors.faint}
                    onSubmitEditing={addMilestone}
                    blurOnSubmit={false}
                    returnKeyType="done"
                    maxLength={TITLE_MAX_LEN}
                  />
                  <Pressable style={styles.milestoneAddBtn} onPress={addMilestone}>
                    <Text style={styles.milestoneAddText}>＋</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* — DÜZENLE — */}
            {activeTab === 'edit' && (
              <GoalForm
                key={goal.id}
                goalType={goal.goal_type}
                initial={goal}
                submitLabel={t('common.save')}
                onSubmit={handleEditSubmit}
                onDelete={handleDelete}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary },

    tabBar: { flexDirection: 'row', gap: 6, marginTop: 20, marginBottom: 20 },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    tabBtnActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    tabLabel: { fontSize: 11, fontWeight: '700', color: c.faint },
    tabLabelActive: { color: c.primary },

    completedBanner: {
      backgroundColor: c.primarySoft,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    completedBannerText: { fontSize: 15, fontWeight: '700', color: c.primary },

    progressTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 5, backgroundColor: c.primary },
    overviewLine: { fontSize: 15, fontWeight: '700', color: c.text },
    deadlineLine: { fontSize: 13, color: c.streak, fontWeight: '700', marginTop: 6 },

    // — Genel sekmesi: veri girişi —
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      gap: 10,
    },
    steppers: { flexDirection: 'row', gap: 6 },
    stepBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
    },
    stepText: { fontSize: 14, fontWeight: '700', color: c.primary },
    completeToggleBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.card,
    },
    completeToggleBtnDone: { backgroundColor: c.done, borderColor: c.done },
    completeToggleText: { fontSize: 13, fontWeight: '700', color: c.primary },
    completeToggleTextDone: { color: c.onAccent },

    sectionTitle: { marginTop: 24, marginBottom: 12 },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },

    habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    habitRowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    habitDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    habitIconText: { fontSize: 14 },
    habitTitle: { flex: 1, fontSize: 14, color: c.text, fontWeight: '600' },
    habitChevron: { fontSize: 18, color: c.faint },

    // — İstatistik kartları (grid) —
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      flexGrow: 1,
      flexBasis: '30%',
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text },
    statValueDanger: { color: c.danger },
    statValuePrimary: { color: c.primary },
    statLabel: { fontSize: 11, color: c.muted, marginTop: 4, textAlign: 'center' },
    paceHint: { fontSize: 12, color: c.faint, marginTop: 4, width: '100%' },

    // — Adımlar (milestone checklist) —
    milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    milestoneBox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneBoxDone: { backgroundColor: c.done, borderColor: c.done },
    milestoneCheck: { color: c.onAccent, fontSize: 12, fontWeight: '800' },
    milestoneTitle: { flex: 1, fontSize: 14, color: c.text },
    milestoneTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    milestoneDelete: { fontSize: 20, color: c.faint, paddingHorizontal: 4 },
    milestoneAddRow: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
    milestoneInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    milestoneAddBtn: {
      width: 44,
      alignSelf: 'stretch',
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    milestoneAddText: { fontSize: 20, color: c.primary, fontWeight: '600' },
  });
