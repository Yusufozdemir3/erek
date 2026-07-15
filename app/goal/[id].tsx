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
import { goalEntryRepo, goalMilestoneRepo, goalRepo } from '@/db';
import type { GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { useGoalStats, type LinkedHabit } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR, deadlineLabel, shortDate, type Colors } from '@/ui/theme';

type Styles = ReturnType<typeof makeStyles>;
type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

// Tam sayıysa ondalık gösterme, değilse 1 ondalık (AmountStepper'daki fmt ile aynı desen).
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Girdi geçmişi satırı için tarih+saat ("15 Tem, 14:32").
function fmtEntryWhen(iso: string, lang: 'tr' | 'en' | 'de'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
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
  // Genel sekmesindeki serbest miktar girişi ("kaç {unit} ekledin?").
  const [entryText, setEntryText] = useState('');

  const goal = stats.goal;

  // — Genel sekmesi: veri girişi ("entry") — kullanıcı istediği miktarı yazar,
  // "Ekle" ile o an biriken ilerlemeye eklenir (goalRepo.addProgress bir DELTA'dır,
  // mutlak değer değil — negatif yazarak düzeltme de yapılabilir). Ayrıca
  // goalEntryRepo'ya tarihiyle bir günlük kaydı düşülür ki kullanıcı Genel
  // sekmesinde "ne zaman ne kadar eklediğini" görebilsin (current_value'nun
  // kaynağı yine addProgress'tir, bu kayıt salt görüntüleme içindir).
  const submitEntry = () => {
    if (!goal) return;
    const parsed = parseFloat(entryText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    goalRepo.addProgress(goal.id, parsed);
    goalEntryRepo.create(goal.id, parsed);
    const g = goalRepo.getById(goal.id);
    g && goalRepo.progressRatio(g) >= 1 ? notifySuccess() : tapLight();
    setEntryText('');
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
                    <Text style={styles.overviewLine}>
                      {fmtAmount(goal.current_value)}
                      {goal.target_value != null ? ` / ${fmtAmount(goal.target_value)}` : ''}
                      {goal.unit ? ` ${goal.unit}` : ''}
                    </Text>
                    {/* Veri girişi burada — kullanıcı istediği miktarı yazıp Ekle'ye basar
                        (bkz. dosya başı yorumu). Negatif yazarak düzeltme de yapılabilir. */}
                    <View style={styles.entryInputRow}>
                      <TextInput
                        style={styles.entryInput}
                        value={entryText}
                        onChangeText={setEntryText}
                        placeholder={t('habit.amountPlaceholder')}
                        placeholderTextColor={colors.faint}
                        keyboardType="numeric"
                        onSubmitEditing={submitEntry}
                        returnKeyType="done"
                      />
                      <Pressable style={styles.entryAddBtn} onPress={submitEntry}>
                        <Text style={styles.entryAddText}>{t('common.add')}</Text>
                      </Pressable>
                    </View>

                    {/* Girdi geçmişi — kullanıcının tarihiyle görebilmesi için (bkz. dosya başı yorumu). */}
                    {stats.entries.length > 0 && (
                      <View style={styles.entryHistory}>
                        <Text style={styles.entryHistoryTitle}>{t('goal.entryHistory')}</Text>
                        {stats.entries.map((e) => (
                          <View key={e.id} style={styles.entryHistoryRow}>
                            <Text
                              style={[
                                styles.entryHistoryAmount,
                                e.amount < 0 && styles.entryHistoryAmountNeg,
                              ]}
                            >
                              {e.amount >= 0 ? '+' : ''}
                              {fmtAmount(e.amount)}
                              {goal.unit ? ` ${goal.unit}` : ''}
                            </Text>
                            <Text style={styles.entryHistoryDate}>{fmtEntryWhen(e.updated_at, lang)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
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
    overviewLine: { fontSize: 15, fontWeight: '700', color: c.text, marginTop: 10 },
    deadlineLine: { fontSize: 13, color: c.streak, fontWeight: '700', marginTop: 6 },

    // — Genel sekmesi: veri girişi —
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      gap: 10,
    },
    // Serbest miktar girişi: kullanıcı yazar, "Ekle"ye basar (numeric hedef).
    entryInputRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
    entryInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    entryAddBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    entryAddText: { fontSize: 14, fontWeight: '700', color: c.onAccent },

    // — Girdi geçmişi —
    entryHistory: { marginTop: 20 },
    entryHistoryTitle: { fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 8 },
    entryHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    entryHistoryAmount: { fontSize: 14, fontWeight: '700', color: c.primary },
    entryHistoryAmountNeg: { color: c.danger },
    entryHistoryDate: { fontSize: 12, color: c.faint },

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
