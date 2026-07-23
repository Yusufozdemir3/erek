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
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { goalEntryRepo, goalMilestoneRepo, goalRepo, reminderRepo } from '@/db';
import type { GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { fmtClock, isTimeUnit, todayDate, toYmd } from '@/lib/helpers';
import { cancelGoalReminders, scheduleGoalReminders } from '@/lib/notifications';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN } from '@/ui/formLimits';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { useGoalStats } from '@/ui/useGoalStats';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, shortDate } from '@/ui/theme';
import { makeGoalStyles, type GoalStyles } from '@/ui/goal/goalStyles';
import { GoalStatsTab } from '@/ui/goal/GoalStatsTab';
import { LinkedHabitRow } from '@/ui/goal/GoalStatCards';
import { fmtAmount, fmtEntryWhen, fmtGoalValue } from '@/ui/goal/goalFormat';

type Styles = GoalStyles;
type GoalTab = 'overview' | 'stats' | 'milestones' | 'edit';

export default function GoalDetailScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalStyles(colors);
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: GoalTab }>();
  const stats = useGoalStats(id);
  const [activeTab, setActiveTab] = useState<GoalTab>((tab as GoalTab) || 'overview');
  const [newMilestone, setNewMilestone] = useState('');
  // Yeni adımın opsiyonel miktarı (yalnız sayısal hedefte görünür) ve son tarihi.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  // Miktar alanı varsayılan olarak KAPALI (çip hâlinde) — çipe basınca açılır.
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
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
    setShowMilestoneAmount(false);
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
              <GoalStatsTab goal={goal} stats={stats} t={t} lang={lang} styles={styles} />
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

                {/* Ekleme satırı KADEMELİ: varsayılan hâli yalnız başlık + ＋.
                    Eskiden miktar kutusu ve tarih düğmesi de aynı satırdaydı ve
                    sabit genişlikleri (76+~40+44+boşluklar ≈ 184px) yüzünden asıl
                    alan olan başlığa ~135px kalıyordu — tarih seçilince ~105px
                    (kullanıcı geri bildirimi: "sade değil"). Artık ikisi de
                    başlığa yazılmaya başlanınca alttaki çip satırında beliriyor:
                    yaygın durum (başlık yaz, Enter) tek temiz satır kalıyor. */}
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
                  <Pressable
                    style={styles.milestoneAddBtn}
                    onPress={addMilestone}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.addMilestone')}
                  >
                    <Text style={styles.milestoneAddText}>＋</Text>
                  </Pressable>
                </View>
                {/* Çipler: başlık boşken gizli — AMA doldurulmuş bir miktar/tarih
                    varsa görünür kalır, yoksa kullanıcı başlığı silince girdiği
                    değer görünmez şekilde taşınırdı. */}
                {(newMilestone.trim().length > 0 || newMilestoneDate != null || newMilestoneAmount.length > 0) && (
                  <View style={styles.milestoneChipRow}>
                    {goal.goal_type === 'numeric' &&
                      (showMilestoneAmount || newMilestoneAmount.length > 0 ? (
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
                          autoFocus
                        />
                      ) : (
                        <Pressable
                          style={styles.milestoneChip}
                          onPress={() => setShowMilestoneAmount(true)}
                          accessibilityRole="button"
                          accessibilityLabel={t('goal.milestoneAmountPlaceholder')}
                        >
                          <Text style={styles.milestoneChipText}>
                            #{' '}
                            {isTimeUnit(goal.unit)
                              ? t('habit.durationPlaceholder')
                              : goal.unit ?? t('goal.milestoneAmountPlaceholder')}
                          </Text>
                        </Pressable>
                      ))}
                    <Pressable
                      style={[styles.milestoneChip, newMilestoneDate != null && styles.milestoneChipSet]}
                      onPress={() =>
                        newMilestoneDate ? setNewMilestoneDate(null) : setShowMilestoneDatePicker(true)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={t('goal.milestoneDueA11y')}
                    >
                      <Text
                        style={[styles.milestoneChipText, newMilestoneDate != null && styles.milestoneChipTextSet]}
                      >
                        {newMilestoneDate
                          ? `📅 ${shortDate(newMilestoneDate, lang)} ×`
                          : `📅 ${t('goal.milestoneDateChip')}`}
                      </Text>
                    </Pressable>
                  </View>
                )}
                {/* Uygulamanın kendi tarih seçicisi — eskiden burada native
                    DateTimePicker vardı ve aynı iş (adıma son tarih verme)
                    oluşturma ekranında DatePickerModal, burada sistem takvimiyle
                    yapılıyordu. Tek seçici: her yerde aynı görünüm/davranış. */}
                <DatePickerModal
                  visible={showMilestoneDatePicker}
                  value={new Date(`${newMilestoneDate ?? todayDate()}T00:00:00`)}
                  onClose={() => setShowMilestoneDatePicker(false)}
                  onConfirm={(picked) => setNewMilestoneDate(toYmd(picked))}
                />
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
