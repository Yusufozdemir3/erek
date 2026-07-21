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
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { goalEntryRepo, goalMilestoneRepo, goalRepo, reminderRepo } from '@/db';
import type { GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { diffDays, fmtClock, isTimeUnit, todayDate, toYmd } from '@/lib/helpers';
import { cancelGoalReminders, scheduleGoalReminders } from '@/lib/notifications';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN } from '@/ui/formLimits';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useGoalStats, type GoalStats, type LinkedHabit } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR, deadlineLabel, shortDate, type Colors } from '@/ui/theme';

type Styles = ReturnType<typeof makeStyles>;
type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

// Tam sayıysa ondalık gösterme, değilse 1 ondalık (AmountStepper'daki fmt ile aynı desen).
function fmtAmount(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

// Bir hedef değerini birimine göre biçimlendirir — süre-ölçümlü hedefte (bkz.
// helpers.TIME_UNIT) saniye cinsinden saklanan değeri saat:dakika:saniye olarak
// gösterir; aksi halde sayı+serbest birim metni (eski davranış). Ham "__time__"
// işaretinin asla ekranda ham metin olarak sızmaması için TÜM unit gösterimleri
// buradan geçmeli.
function fmtGoalValue(n: number, unit: string | null): string {
  return isTimeUnit(unit) ? fmtClock(n) : `${fmtAmount(n)}${unit ? ` ${unit}` : ''}`;
}

// Girdi geçmişi satırı için tarih+saat ("15 Tem, 14:32").
function fmtEntryWhen(iso: string, lang: 'tr' | 'en' | 'de'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(DATE_LOCALE[lang], { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(DATE_LOCALE[lang], { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

// İstatistik sekmesinin en üstündeki tek "sonuç" bandı — kullanıcının asıl
// merak ettiği "yetişecek miyim?" sorusunu 6 kutuyu birleştirmeden tek cümleyle
// yanıtlar. Yalnız sayısal hedefte ve tempo/son tarih verisi varken üretilir;
// yoksa null (bant gösterilmez). tone renk verir: good=yeşil, bad=kırmızı,
// neutral=vurgu.
type Verdict = { text: string; sub?: string; tone: 'good' | 'bad' | 'neutral' };
function buildVerdict(
  goal: { goal_type: string; deadline: string | null; unit: string | null },
  stats: GoalStats,
  t: (key: string, params?: Record<string, string | number>) => string,
  lang: 'tr' | 'en' | 'de'
): Verdict | null {
  if (goal.goal_type !== 'numeric') return null;
  if (stats.completed) return { text: t('goalStats.verdictDone'), tone: 'good' };

  // Gerçek tempodan tahmini bitiş var: son tarihle kıyasla.
  if (stats.projectedFinishDate) {
    const finish = shortDate(stats.projectedFinishDate, lang);
    if (goal.deadline) {
      const gap = diffDays(stats.projectedFinishDate, goal.deadline); // >0 = erken
      if (gap > 0) return { text: t('goalStats.verdictEarly', { date: finish, n: gap }), tone: 'good' };
      if (gap === 0) return { text: t('goalStats.verdictOnTime', { date: finish }), tone: 'good' };
      return {
        text: t('goalStats.verdictLate', { date: finish, n: -gap }),
        sub:
          stats.dailyPace != null
            ? t('goalStats.verdictFix', { amount: fmtGoalValue(stats.dailyPace, goal.unit) })
            : undefined,
        tone: 'bad',
      };
    }
    return { text: t('goalStats.verdictFinish', { date: finish }), tone: 'neutral' };
  }

  // Henüz girdi yok ama gereken tempo hesaplanabiliyor: yalnız gerekliliği söyle.
  if (stats.dailyPace != null && goal.deadline) {
    return {
      text: t('goalStats.verdictNeed', { amount: fmtGoalValue(stats.dailyPace, goal.unit) }),
      tone: 'neutral',
    };
  }
  return null;
}

function StatGroupTitle({ label, styles }: { label: string; styles: Styles }) {
  return <Text style={styles.groupTitle}>{label}</Text>;
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
        {habit.icon ? <HabitIconGlyph id={habit.icon} size={14} color={color} /> : null}
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
  // Yeni adımın opsiyonel miktarı (yalnız sayısal hedefte görünür) ve son tarihi.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  // Genel sekmesindeki serbest miktar girişi ("kaç {unit} ekledin?").
  const [entryText, setEntryText] = useState('');

  const goal = stats.goal;

  // — Genel sekmesi: veri girişi ("entry") — kullanıcı istediği miktarı yazar,
  // "Ekle" ile o an biriken ilerlemeye eklenir (goalRepo.addProgress bir DELTA'dır,
  // mutlak değer değil — negatif yazarak düzeltme de yapılabilir). Günlük kaydını
  // addProgress'in kendisi düşer (bağlı alışkanlık katkıları da böylece geçmişe
  // girer; bkz. goalRepo.addProgress).
  // Tamamlanma durumu değişmiş olabilecek her mutasyondan sonra hatırlatmaları
  // güncel duruma göre yeniden kur: scheduleGoalReminders tamamlanan/hatırlatmasız
  // hedefte kendiliğinden yalnız iptal eder (cancel-then-maybe-schedule deseni).
  // İzin reddi (ok=false) burada SESSİZCE geçilir (her giriş/adım değişiminde
  // uyarı göstermek rahatsız edici olurdu) — yalnızca handleEditSubmit (kullanıcı
  // hatırlatmayı bilerek değiştirdiği an) sonucu kontrol edip uyarı gösterir.
  // Gerçek bir hata (rejection) en azından console.warn ile görünür kalır —
  // eskiden tamamen yutuluyordu.
  const refreshReminder = (): Promise<boolean> => {
    const g = goalRepo.getById(id);
    if (!g) return Promise.resolve(true);
    return scheduleGoalReminders(g, reminderRepo.listByEntity('goal', id)).catch((e) => {
      console.warn('[Bildirim] Hedef hatırlatması güncellenemedi:', e);
      return true;
    });
  };

  const submitEntry = () => {
    if (!goal) return;
    const parsed = parseFloat(entryText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed === 0) return;
    // Süre-ölçümlü hedefte dakika girilir, saniye saklanır (target/current_value
    // ile aynı birim — bkz. GoalForm'daki aynı desen).
    const amount = isTimeUnit(goal.unit) ? Math.round(parsed * 60) : parsed;
    // Girdi kaydını addProgress'in kendisi yazar (gerçekleşen farkla) — burada
    // ayrıca goalEntryRepo.create çağırmak ÇİFT kayıt olurdu.
    goalRepo.addProgress(goal.id, amount);
    const g = goalRepo.getById(goal.id);
    g && goalRepo.progressRatio(g) >= 1 ? notifySuccess() : tapLight();
    setEntryText('');
    refreshReminder();
    stats.reload();
  };
  const toggleGoalCompleted = () => {
    if (!goal) return;
    const completing = goal.completed_at === null;
    goalRepo.setCompleted(goal.id, completing);
    completing ? notifySuccess() : tapLight();
    refreshReminder();
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
    refreshReminder(); // adımlar hedefi tamamlamış/geri açmış olabilir
    stats.reload();
  };
  const addMilestone = () => {
    const v = newMilestone.trim();
    if (!v || !goal) return;
    // Miktar yalnız sayısal hedefte anlamlı; doluysa adım kendi bağımsız
    // hedefi olur (girişlerle dolar, işaretlenmez), boşsa sıradan checklist maddesi.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goal.goal_type === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTimeUnit(goal.unit)
          ? Math.round(parsedAmount * 60) // dakika girilir, saniye saklanır
          : parsedAmount
        : null;
    goalMilestoneRepo.create(goal.id, v, { amount, due_date: newMilestoneDate });
    setNewMilestone('');
    setNewMilestoneAmount('');
    setNewMilestoneDate(null);
    refreshMilestones();
  };
  // Yalnız checklist (miktarsız) adımlar elle işaretlenir; ara-eşik adımının
  // durumu girişlerden türetilir (bkz. milestoneViews).
  const toggleMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.setCompleted(m.id, m.completed === 0);
    refreshMilestones();
  };
  const removeMilestone = (m: GoalMilestone) => {
    goalMilestoneRepo.softDelete(m.id);
    refreshMilestones();
  };

  // — Düzenle sekmesi —
  // "Mevcut değer"i elle değiştirmek VARSAYILAN olarak salt DÜZELTMEdir — tempo/
  // projeksiyon (goalProjection.ts) yalnızca goal_entries'ten hesaplandığından
  // bu değişiklik oraya yazılmaz. Kullanıcı GoalForm'daki "İlerleme geçmişine de
  // ekle" onay kutusunu işaretlerse (log_manual_change), GERÇEKTEN uygulanan farkı
  // (kırpma sonrası) goalEntryRepo'ya yazarız — addProgress'in yaptığının aynısı,
  // yalnızca elle düzenleme yolundan.
  const handleEditSubmit = (values: GoalFormValues) => {
    if (!goal) return;
    const previousValue = goal.current_value;
    goalRepo.update(goal.id, {
      title: values.title,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      start_date: values.start_date,
      ...(values.current_value != null ? { current_value: values.current_value } : {}),
    });
    if (values.log_manual_change && values.current_value != null) {
      const updated = goalRepo.getById(goal.id);
      const delta = updated ? updated.current_value - previousValue : 0;
      if (delta !== 0) goalEntryRepo.create(goal.id, delta);
    }
    reminderRepo.replaceAll('goal', goal.id, values.remind_times);
    // Kullanıcı hatırlatmayı BİLEREK değiştirdiği an — izin reddiyse uyar
    // (habit/task düzenleme panelleriyle aynı desen).
    refreshReminder().then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    stats.reload();
    setActiveTab('overview');
  };
  const handleDelete = () => {
    if (!goal) return;
    goalRepo.softDelete(goal.id);
    cancelGoalReminders(goal.id).catch(() => {});
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
                      {isTimeUnit(goal.unit)
                        ? `${fmtClock(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtClock(goal.target_value)}` : ''
                          }`
                        : `${fmtAmount(goal.current_value)}${
                            goal.target_value != null ? ` / ${fmtAmount(goal.target_value)}` : ''
                          }${goal.unit ? ` ${goal.unit}` : ''}`}
                    </Text>
                    {/* Veri girişi burada — kullanıcı istediği miktarı yazıp Ekle'ye basar
                        (bkz. dosya başı yorumu). Negatif yazarak düzeltme de yapılabilir. */}
                    <View style={styles.entryInputRow}>
                      <TextInput
                        style={styles.entryInput}
                        value={entryText}
                        onChangeText={setEntryText}
                        placeholder={isTimeUnit(goal.unit) ? t('habit.durationPlaceholder') : t('habit.amountPlaceholder')}
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
                              {e.amount >= 0 ? '+' : '-'}
                              {isTimeUnit(goal.unit)
                                ? fmtClock(Math.abs(e.amount))
                                : `${fmtAmount(Math.abs(e.amount))}${goal.unit ? ` ${goal.unit}` : ''}`}
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

            {/* — İSTATİSTİK — üstte tek sonuç bandı, altında kompakt üst satır ve
                başlıklı gruplar (gereken tempo / senin tempon). Onlarca eşit kutu
                yerine hiyerarşi: göz önce "yetişecek miyim?" cevabına gider. */}
            {activeTab === 'stats' && (
              <View>
                {(() => {
                  const verdict = buildVerdict(goal, stats, t, lang);
                  return verdict ? (
                    <View
                      style={[
                        styles.verdict,
                        verdict.tone === 'good' && styles.verdictGood,
                        verdict.tone === 'bad' && styles.verdictBad,
                      ]}
                    >
                      <Text
                        style={[
                          styles.verdictText,
                          verdict.tone === 'good' && styles.verdictTextGood,
                          verdict.tone === 'bad' && styles.verdictTextBad,
                        ]}
                      >
                        {verdict.text}
                      </Text>
                      {verdict.sub && <Text style={styles.verdictSub}>{verdict.sub}</Text>}
                    </View>
                  ) : null;
                })()}

                {/* Üst satır — bir bakışta "neredeyim": ilerleme, kalan, son tarih, kalan gün */}
                <View style={styles.statsGrid}>
                  {goal.goal_type === 'numeric' && (
                    <>
                      <StatCard label={t('goal.statRatio')} value={`%${Math.round(stats.ratio * 100)}`} styles={styles} />
                      <StatCard
                        label={t('goal.statRemaining')}
                        value={stats.remaining != null ? fmtGoalValue(stats.remaining, goal.unit) : '–'}
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
                </View>

                {/* Gereken tempo — app'in senden istediği (son tarihe yetişmek için) */}
                {goal.goal_type === 'numeric' && stats.dailyPace != null && (
                  <>
                    <StatGroupTitle label={t('goalStats.groupRequiredPace')} styles={styles} />
                    <View style={styles.statsGrid}>
                      <StatCard
                        label={t('goalStats.dailyPaceLabel')}
                        value={fmtGoalValue(stats.dailyPace, goal.unit)}
                        accent="primary"
                        styles={styles}
                      />
                      <StatCard
                        label={t('goalStats.weeklyPaceLabel')}
                        value={fmtGoalValue(stats.weeklyPace!, goal.unit)}
                        styles={styles}
                      />
                    </View>
                  </>
                )}

                {/* Senin temponun — gerçekte yaptığın; üstteki grupla kıyaslanır */}
                {goal.goal_type === 'numeric' && stats.avgDaily != null && (
                  <>
                    <StatGroupTitle label={t('goalStats.groupYourPace')} styles={styles} />
                    <View style={styles.statsGrid}>
                      <StatCard
                        label={t('goalStats.avgDailyLabel')}
                        value={fmtGoalValue(stats.avgDaily, goal.unit)}
                        styles={styles}
                      />
                      {stats.last7Total != null && (
                        <StatCard
                          label={t('goalStats.last7Label')}
                          value={fmtGoalValue(stats.last7Total, goal.unit)}
                          styles={styles}
                        />
                      )}
                      {stats.behindAmount != null && Math.abs(stats.behindAmount) >= 0.05 && (
                        <StatCard
                          label={t(stats.behindAmount > 0 ? 'goalStats.behindLabel' : 'goalStats.aheadLabel')}
                          value={fmtGoalValue(Math.abs(stats.behindAmount), goal.unit)}
                          accent={stats.behindAmount > 0 ? 'danger' : undefined}
                          styles={styles}
                        />
                      )}
                      {stats.daysElapsed != null && (
                        <StatCard
                          label={t('goalStats.daysElapsedLabel')}
                          value={String(stats.daysElapsed)}
                          styles={styles}
                        />
                      )}
                    </View>
                  </>
                )}

                {/* Adımlar — adımı olan HER hedefte görünür, tipe bakılmaksızın */}
                {stats.milestonesTotal > 0 && (
                  <>
                    <StatGroupTitle label={t('goalStats.groupMilestones')} styles={styles} />
                    <View style={styles.statsGrid}>
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
                    </View>
                  </>
                )}

                {!goal.deadline && <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>}
              </View>
            )}

            {/* — ADIMLAR — iki kip: sayısal hedefte miktarlı adım = KENDİ
                BAĞIMSIZ hedefi (ör. "ilk 5km"/"ilk 20km"/"ilk 50km" — hepsi
                current_value'dan aynı anda dolar, İŞARETLENEMEZ, yüzde barı
                gösterir); miktarsız adım = elle işaretlenen checklist (subtask
                deseni). Bkz. goalMilestoneRepo.milestoneViews. */}
            {activeTab === 'milestones' && (
              <View>
                {stats.milestoneViews.map((v) => {
                  const m = v.milestone;
                  const threshold = goal.goal_type === 'numeric' && m.amount != null && m.amount > 0;
                  const done = v.reached;
                  const overdue = !!m.due_date && !done && m.due_date < todayDate();
                  return (
                    <View key={m.id} style={styles.milestoneRow}>
                      {threshold ? (
                        <View style={{ flex: 1 }}>
                          <View style={styles.milestoneTopRow}>
                            <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>
                              {m.title}
                            </Text>
                            <Text style={[styles.milestonePct, done && styles.milestonePctDone]}>
                              {done ? '✓' : `%${Math.round(v.ratio * 100)}`}
                            </Text>
                          </View>
                          <View style={styles.milestoneBarTrack}>
                            <View
                              style={[styles.milestoneBarFill, { width: `${Math.round(v.ratio * 100)}%` }]}
                            />
                          </View>
                          <View style={styles.milestoneMetaRow}>
                            <Text style={styles.milestoneMeta}>{fmtGoalValue(m.amount!, goal.unit)}</Text>
                            {m.due_date && (
                              <Text style={[styles.milestoneMeta, overdue && styles.milestoneMetaOverdue]}>
                                {shortDate(m.due_date, lang)}
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : (
                        <>
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
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.milestoneTitle, done && styles.milestoneTitleDone]}>
                              {m.title}
                            </Text>
                            {m.due_date && (
                              <Text style={[styles.milestoneMeta, overdue && styles.milestoneMetaOverdue]}>
                                {shortDate(m.due_date, lang)}
                              </Text>
                            )}
                          </View>
                        </>
                      )}
                      <Pressable
                        onPress={() => removeMilestone(m)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('goal.removeMilestoneA11y', { title: m.title })}
                      >
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
                  {goal.goal_type === 'numeric' && (
                    <TextInput
                      style={styles.milestoneAmountInput}
                      value={newMilestoneAmount}
                      onChangeText={setNewMilestoneAmount}
                      placeholder={
                        isTimeUnit(goal.unit)
                          ? t('habit.durationPlaceholder')
                          : goal.unit ?? t('goal.milestoneAmountPlaceholder')
                      }
                      placeholderTextColor={colors.faint}
                      keyboardType="numeric"
                      maxLength={NUMBER_MAX_LEN}
                    />
                  )}
                  <Pressable
                    style={[styles.milestoneDateBtn, newMilestoneDate && styles.milestoneDateBtnSet]}
                    onPress={() =>
                      newMilestoneDate ? setNewMilestoneDate(null) : setShowMilestoneDatePicker(true)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.milestoneDueA11y')}
                  >
                    <Text style={styles.milestoneDateBtnText}>
                      {newMilestoneDate ? `${shortDate(newMilestoneDate, lang)} ×` : '📅'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.milestoneAddBtn}
                    onPress={addMilestone}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.addMilestone')}
                  >
                    <Text style={styles.milestoneAddText}>＋</Text>
                  </Pressable>
                </View>
                {showMilestoneDatePicker && (
                  <DateTimePicker
                    value={new Date(`${newMilestoneDate ?? todayDate()}T00:00:00`)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(_e: unknown, picked?: Date) => {
                      setShowMilestoneDatePicker(Platform.OS === 'ios');
                      if (picked) setNewMilestoneDate(toYmd(picked));
                    }}
                  />
                )}
                {goal.goal_type === 'numeric' && (
                  <Text style={styles.milestoneHint}>{t('goal.milestoneThresholdHint')}</Text>
                )}
              </View>
            )}

            {/* — DÜZENLE — */}
            {activeTab === 'edit' && (
              <GoalForm
                key={goal.id}
                goalType={goal.goal_type}
                initial={{ ...goal, remind_times: reminderRepo.listByEntity('goal', goal.id).map((r) => r.time) }}
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
    habitTitle: { flex: 1, fontSize: 14, color: c.text, fontWeight: '600' },
    habitChevron: { fontSize: 18, color: c.faint },

    // — İstatistik: sonuç bandı + grup başlıkları —
    verdict: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      padding: 16,
      marginBottom: 18,
    },
    verdictGood: { borderColor: c.done, backgroundColor: c.done + '18' },
    verdictBad: { borderColor: c.danger, backgroundColor: c.danger + '18' },
    verdictText: { fontSize: 16, fontWeight: '800', color: c.text, lineHeight: 22 },
    verdictTextGood: { color: c.done },
    verdictTextBad: { color: c.danger },
    verdictSub: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: 6 },
    groupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.muted,
      marginTop: 22,
      marginBottom: 10,
    },

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

    // — Adımlar (checklist + ara-eşik barları) —
    milestoneRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    milestoneTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    milestonePct: { fontSize: 13, fontWeight: '800', color: c.primary },
    milestonePctDone: { color: c.done },
    milestoneBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.track,
      overflow: 'hidden',
      marginTop: 6,
    },
    milestoneBarFill: { height: '100%', borderRadius: 4, backgroundColor: c.primary },
    milestoneMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    milestoneMeta: { fontSize: 11, color: c.faint, fontWeight: '600' },
    milestoneMetaOverdue: { color: c.danger },
    milestoneAmountInput: {
      width: 76,
      textAlign: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingVertical: 12,
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    milestoneDateBtn: {
      alignSelf: 'stretch',
      justifyContent: 'center',
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    milestoneDateBtnSet: { borderColor: c.primary, backgroundColor: c.primarySoft },
    milestoneDateBtnText: { fontSize: 12, fontWeight: '700', color: c.muted },
    milestoneHint: { fontSize: 11, color: c.faint, marginTop: 10, lineHeight: 15 },
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
