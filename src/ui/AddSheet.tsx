// Merkezi ＋ butonunun açtığı ekleme formu (sayfayı ortalayan modal — alttan
// değil). Genelde ＋ menüsü türü seçtiği için doğrudan ilgili formda açılır
// (initialStep); "‹ Geri" ile tür seçim menüsüne dönülebilir.
// Tüm türler oluşturma anında TAM ayarlarıyla eklenir: görev (TaskForm) ve
// alışkanlık (HabitForm) düzenleme paneliyle aynı formu paylaşır; hedef kendi
// tam formuyla (goals.tsx'ten taşınmış). Ekleme sonrası notifyDataChanged ile
// açık ekranların listeleri tazelenir ve ilgili sekmeye gidilir.
// Mimari kural: SQL yok — yalnızca repo çağrıları.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { goalMilestoneRepo, goalRepo, habitRepo, subtaskRepo, taskRepo } from '@/db';
import { scheduleGoalReminder, scheduleHabitReminder, scheduleTaskReminder } from '@/lib/notifications';
import { isAiQuickAddEnabled } from '@/lib/aiPrefs';
import { parseTaskText, type ParsedTaskFields } from '@/lib/aiTaskParser';
import { recognizeSpeech } from '@/lib/voiceInput';
import { useAppData } from '@/ui/AppData';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import { Feather } from '@expo/vector-icons';
import { shortDate, type Colors } from '@/ui/theme';

export type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Açılırken doğrudan gidilecek adım. Merkezi ＋ menüsü türü kendi seçtiği
  // için genelde bir form adımı verilir; verilmezse tür seçim menüsü açılır.
  initialStep?: Step;
}

// Metinler i18n anahtarı olarak tutulur; render'da t() ile çevrilir. İkonlar
// EntityIcon ile tab bar'daki aynı çizgi ikon setinden (tutarlılık).
const MENU_OPTIONS: { step: Step; type: EntityType; titleKey: string; descKey: string }[] = [
  { step: 'task', type: 'task', titleKey: 'add.task', descKey: 'add.taskDesc' },
  { step: 'habit', type: 'habit', titleKey: 'add.habit', descKey: 'add.habitDesc' },
  { step: 'goal', type: 'goal', titleKey: 'add.goal', descKey: 'add.goalDesc' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu' }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, notifyDataChanged, selectedDate } = useAppData();
  const [step, setStep] = useState<Step>(initialStep);

  // AI ile hızlı ekleme — kullanıcı Profil'den açtıysa (varsayılan KAPALI) görev
  // adımında bir metin kutusu belirir. TaskForm kendi state'ini yalnızca mount
  // anında initial'den okur (uncontrolled) — bu yüzden AI sonucu gelince
  // aiFormKey artırılıp TaskForm TAZE remount edilir (HabitEditModal deseni).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [aiPrefill, setAiPrefill] = useState<ParsedTaskFields | null>(null);
  const [aiFormKey, setAiFormKey] = useState(0);
  // Metinde BİRDEN FAZLA görev bulunursa (bkz. parseTaskText) tek formu prefill
  // etmek yerine bu liste dolar — ekran o zaman TaskForm değil, seçilebilir bir
  // özet liste gösterir (aşağıda aiResults != null kontrolü).
  const [aiResults, setAiResults] = useState<ParsedTaskFields[] | null>(null);
  const [aiSelected, setAiSelected] = useState<Set<number>>(new Set());

  // Her açılışta istenen adıma (varsayılan menü) dön + önceki AI taslağını at.
  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setAiPrefill(null);
      setAiResults(null);
      setAiText('');
      isAiQuickAddEnabled().then(setAiEnabled);
    }
  }, [visible, initialStep]);

  // Metni Gemini'ye gönderip görev(ler)e ayrıştırır. Hem "Ayrıştır" düğmesi hem
  // sesli girişten sonra ÇAĞRILIR — parametre olarak alır, aiText state'ine
  // güvenmez (sesli giriş dönüşünde state henüz güncellenmemiş olabilir).
  // Tek görev bulunursa TaskForm'u prefill eder (tam düzenleme); birden fazla
  // bulunursa seçilebilir özet liste gösterilir (toplu ekleme).
  const doParse = async (text: string) => {
    if (!text.trim()) return;
    setAiLoading(true);
    const parsed = await parseTaskText(text, lang);
    setAiLoading(false);
    if (!parsed || parsed.length === 0) {
      Alert.alert(t('add.aiParseFailedTitle'), t('add.aiParseFailedBody'));
      return;
    }
    if (parsed.length === 1) {
      setAiPrefill(parsed[0]);
      setAiFormKey((k) => k + 1);
      setAiResults(null);
    } else {
      setAiResults(parsed);
      setAiSelected(new Set(parsed.map((_, i) => i)));
      setAiPrefill(null);
    }
    setAiText('');
  };

  const toggleAiSelected = (i: number) => {
    setAiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const runAiParse = () => doParse(aiText);

  // Sesli giriş — Android'in sistem konuşma tanıma ekranını açar (ücretsiz,
  // ekstra API çağrısı yok). Sonuç gelince otomatik ayrıştırılır (konuşmak zaten
  // niyetli bir eylem; form yine de kaydetmeden ÖNCE gözden geçirmeyi gerektirir).
  // 'unavailable' (cihazda tanıma uygulaması yok) ile 'canceled' (kullanıcı geri
  // bastı) AYRI ele alınır — vazgeçme sessiz kalmalı, cihazda özellik hiç yoksa
  // sebepsiz "hiçbir şey olmadı" hissi vermemek için açıkça söylenir.
  const runVoiceInput = async () => {
    if (voiceLoading || aiLoading) return;
    setVoiceLoading(true);
    const result = await recognizeSpeech(lang, t('add.aiVoicePrompt'));
    setVoiceLoading(false);
    if (result.status === 'unavailable') {
      Alert.alert(t('add.voiceUnavailableTitle'), t('add.voiceUnavailableBody'));
      return;
    }
    if (result.status === 'canceled' || !result.text) return;
    setAiText(result.text);
    await doParse(result.text);
  };

  // Ekleme sonrası: menüyü kapat, listeleri tazele, ilgili sekmeye git.
  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  // DB'ye yazma + bildirim kurma — finish/navigasyon İÇERMEZ (bkz. addTask tekli
  // / addSelectedAiTasks toplu: toplu eklemede finish tek seferde en sonda çağrılır,
  // her görev için modalı kapatıp yönlendirmek anlamsız/riskli olurdu).
  const createTask = (values: TaskFormValues) => {
    const created = taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
      recurrence: values.recurrence,
      remind_at: values.remind_at,
    });
    // Taslak alt görevleri, görev yazıldıktan sonra sırayla oluştur.
    values.subtasks?.forEach((t) => subtaskRepo.create(created.id, t));
    // Hatırlatma saati seçildiyse o an bildirim kurulur (yoksa no-op).
    scheduleTaskReminder(created).then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    return created;
  };

  // Görev, düzenleme paneliyle aynı TaskForm'la oluşturulur — öncelik, son tarih,
  // saat ve (isteğe bağlı) alt görevler oluşturma anında ayarlanabilir.
  const addTask = (values: TaskFormValues) => {
    createTask(values);
    finish('/(tabs)/tasks');
  };

  // AI'ın bulduğu BİRDEN FAZLA görevden seçili olanları toplu oluşturur — her
  // biri için tam form YOK (hız için bilinçli), ama ekleme öncesi özet liste
  // (bkz. render) gözden geçirip istemediğini çıkarma imkanı verir.
  const addSelectedAiTasks = () => {
    if (!aiResults) return;
    aiResults.forEach((r, i) => {
      if (!aiSelected.has(i)) return;
      const due_date = r.due_date
        ? r.due_time
          ? `${r.due_date}T${r.due_time}:00`
          : r.due_date
        : selectedDate;
      createTask({
        title: r.title,
        priority: r.priority ?? 'medium',
        due_date,
        end_time: null,
        recurrence: null,
        remind_at: null,
      });
    });
    finish('/(tabs)/tasks');
  };

  // Alışkanlık, düzenleme paneliyle aynı HabitForm'la oluşturulur — tüm ayarlar
  // (ikon, renk, sıklık, tarih aralığı, nicel hedef, hatırlatma, hedefe bağla)
  // oluşturma anında ayarlanabilir.
  const addHabit = (values: HabitFormValues) => {
    const created = habitRepo.create({ user_id: user.id, ...values });
    // Hatırlatma saati seçildiyse bildirimi programla (izin yoksa uyar).
    if (created.remind_at) {
      scheduleHabitReminder(created).then((ok) => {
        if (!ok) {
          Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
        }
      });
    }
    finish('/(tabs)/habits');
  };

  // Hedef, düzenleme paneliyle aynı GoalForm'la oluşturulur — tip (sayısal/parçalı)
  // yalnızca burada seçilir, deadline zorunlu, taslak milestone'lar hedefle
  // birlikte yazılır.
  const addGoal = (values: GoalFormValues) => {
    const created = goalRepo.create({
      user_id: user.id,
      title: values.title,
      goal_type: values.goal_type,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      remind_at: values.remind_at,
      start_date: values.start_date,
    });
    values.milestones?.forEach((m) => goalMilestoneRepo.create(created.id, m));
    // Günlük giriş hatırlatması (remind_at yoksa scheduleGoalReminder no-op'tur).
    scheduleGoalReminder(created).catch(() => {});
    finish('/(tabs)/goals');
  };

  return (
    <ModalCard visible={visible} onClose={onClose}>
          {step === 'menu' ? (
            <>
              <Text style={styles.heading}>{t('add.menuTitle')}</Text>
              {MENU_OPTIONS.map((opt) => (
                <Pressable key={opt.step} style={styles.option} onPress={() => setStep(opt.step)}>
                  <View style={styles.optionIcon}>
                    <EntityIcon type={opt.type} size={22} color={colors.primary} />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{t(opt.titleKey)}</Text>
                    <Text style={styles.optionDesc}>{t(opt.descKey)}</Text>
                  </View>
                  <Text style={styles.optionChevron}>›</Text>
                </Pressable>
              ))}
            </>
          ) : (
            // ModalCard içeriği zaten ScrollView'da sarar (uzun alışkanlık formu
            // güvenle kaydırılır, "Ekle" düğmesi kırpılmaz).
            <>
              <View style={styles.formHead}>
                <Pressable onPress={() => setStep('menu')} hitSlop={8}>
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? t('add.newTask') : step === 'habit' ? t('add.newHabit') : t('add.newGoal')}
                </Text>
                {/* başlığı ortalamak için sol taraftaki "‹ Geri" genişliğinde boşluk */}
                <View style={styles.headSpacer} />
              </View>

              {step === 'habit' ? (
                // Takip tipi (tik/sayısal/zamanlayıcı) sihirbazın kendi ilk adımı —
                // HabitForm'a `kind` verilmez, kullanıcı stepped modda seçer.
                <HabitForm
                  userId={user.id}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  stepped
                  onSubmit={addHabit}
                />
              ) : step === 'task' ? (
                <>
                  {/* AI ile hızlı ekleme — Profil'den açılmışsa görünür (varsayılan
                      KAPALI). Metin yalnızca "Ayrıştır"a basınca gönderilir; sonuç
                      formu ÖNCEDEN DOLDURUR, otomatik kaydetmez — kullanıcı gözden
                      geçirip düzenleyebilir/reddedebilir. */}
                  {aiEnabled && !aiResults && (
                    <View style={styles.aiBox}>
                      <View style={styles.aiInputRow}>
                        {Platform.OS === 'android' && (
                          <Pressable
                            style={[styles.aiMicBtn, voiceLoading && styles.aiBtnDisabled]}
                            onPress={runVoiceInput}
                            disabled={aiLoading || voiceLoading}
                            accessibilityRole="button"
                            accessibilityLabel={t('add.aiVoicePrompt')}
                          >
                            {voiceLoading ? (
                              <ActivityIndicator color={colors.primary} size="small" />
                            ) : (
                              <Feather name="mic" size={18} color={colors.primary} />
                            )}
                          </Pressable>
                        )}
                        <TextInput
                          style={styles.aiInput}
                          value={aiText}
                          onChangeText={setAiText}
                          placeholder={t('add.aiPlaceholder')}
                          placeholderTextColor={colors.faint}
                          editable={!aiLoading}
                          multiline
                        />
                        <Pressable
                          style={[styles.aiBtn, (aiLoading || !aiText.trim()) && styles.aiBtnDisabled]}
                          onPress={runAiParse}
                          disabled={aiLoading || !aiText.trim()}
                        >
                          {aiLoading ? (
                            <ActivityIndicator color={colors.onAccent} size="small" />
                          ) : (
                            <Text style={styles.aiBtnText}>{t('add.aiParse')}</Text>
                          )}
                        </Pressable>
                      </View>
                      <Text style={styles.aiHint}>{t('add.aiHint')}</Text>
                    </View>
                  )}

                  {aiResults ? (
                    // Birden fazla görev bulundu — tek tek form doldurmak yerine
                    // seçilebilir özet liste (hız için bilinçli; istemediğini
                    // çıkarabilirsin, yanlış geleni sonradan düzenleme panelinden
                    // düzeltebilirsin).
                    <View>
                      <Text style={styles.aiResultsTitle}>
                        {t('add.aiMultiFound', { n: aiResults.length })}
                      </Text>
                      {aiResults.map((r, i) => {
                        const selected = aiSelected.has(i);
                        const meta = r.due_date
                          ? r.due_time
                            ? `${shortDate(r.due_date, lang)} · ${r.due_time}`
                            : shortDate(r.due_date, lang)
                          : null;
                        return (
                          <Pressable
                            key={i}
                            style={styles.aiResultRow}
                            onPress={() => toggleAiSelected(i)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                          >
                            <Feather
                              name={selected ? 'check-square' : 'square'}
                              size={20}
                              color={selected ? colors.primary : colors.faint}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.aiResultTitle}>{r.title}</Text>
                              {meta && <Text style={styles.aiResultMeta}>{meta}</Text>}
                            </View>
                          </Pressable>
                        );
                      })}
                      <View style={styles.actions}>
                        <Pressable style={styles.aiBackBtn} onPress={() => setAiResults(null)}>
                          <Text style={styles.aiBackBtnText}>{t('common.back')}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.saveBtn, aiSelected.size === 0 && styles.aiBtnDisabled]}
                          onPress={addSelectedAiTasks}
                          disabled={aiSelected.size === 0}
                        >
                          <Text style={styles.saveBtnText}>
                            {t('add.aiAddN', { n: aiSelected.size })}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    // Görev: düzenleme paneliyle aynı tam form (öncelik, tarih, saat)
                    // + oluşturmada taslak alt görev ekleme. Son tarih "Bugün" ekranında
                    // o an bakılan güne varsayılanır (selectedDate) — Cuma'ya bakarken
                    // eklenen görev Cuma'ya gitsin diye. AI sonucu gelince key değişip
                    // form taze remount olur (initial yeni alanlarla doldurulur).
                    <TaskForm
                      key={aiFormKey}
                      initial={
                        aiPrefill
                          ? {
                              title: aiPrefill.title,
                              priority: aiPrefill.priority ?? undefined,
                              due_date: aiPrefill.due_date
                                ? aiPrefill.due_time
                                  ? `${aiPrefill.due_date}T${aiPrefill.due_time}:00`
                                  : aiPrefill.due_date
                                : selectedDate,
                            }
                          : { due_date: selectedDate }
                      }
                      submitLabel={t('common.add')}
                      autoFocusTitle={!aiEnabled}
                      enableSubtaskDraft
                      onSubmit={addTask}
                    />
                  )}
                </>
              ) : (
                // Hedef: düzenleme paneliyle aynı GoalForm — tip (sayısal/parçalı)
                // yalnızca oluştururken seçilir.
                <GoalForm
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  enableMilestoneDraft
                  onSubmit={addGoal}
                />
              )}
            </>
          )}
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },

    // — AI ile hızlı ekleme (görev adımı, Profil'den açılırsa görünür) —
    aiBox: {
      backgroundColor: c.primarySoft,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.primary,
      padding: 12,
      marginBottom: 16,
    },
    aiInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
    aiMicBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiInput: {
      flex: 1,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      maxHeight: 80,
    },
    aiBtn: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 76,
    },
    aiBtnDisabled: { opacity: 0.5 },
    aiBtnText: { color: c.onAccent, fontSize: 13, fontWeight: '700' },
    aiHint: { fontSize: 11, color: c.muted, marginTop: 8 },

    // — Çoklu görev özet listesi (AI birden fazla görev bulunca) —
    aiResultsTitle: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 12 },
    aiResultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginBottom: 8,
    },
    aiResultTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    aiResultMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
    aiBackBtn: {
      paddingVertical: 15,
      paddingHorizontal: 18,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiBackBtnText: { fontSize: 15, fontWeight: '700', color: c.muted },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    // Emoji için yuvarlak yumuşak kutu (premium his).
    optionIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    optionBody: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    optionDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
    optionChevron: { fontSize: 22, color: c.faint, fontWeight: '600' },

    formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary, marginBottom: 16 },
    headSpacer: { width: 44 },
  });
