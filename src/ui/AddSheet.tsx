// Merkezi ＋ butonunun açtığı ekleme formu (sayfayı ortalayan modal — alttan
// değil). Genelde ＋ menüsü türü seçtiği için doğrudan ilgili formda açılır
// (initialStep); "‹ Geri" ile tür seçim menüsüne dönülebilir.
// Tüm türler oluşturma anında TAM ayarlarıyla eklenir: görev (TaskForm) ve
// alışkanlık (HabitForm) düzenleme paneliyle aynı formu paylaşır; hedef kendi
// tam formuyla (goals.tsx'ten taşınmış). Ekleme sonrası notifyDataChanged ile
// açık ekranların listeleri tazelenir ve ilgili sekmeye gidilir.
// Mimari kural: SQL yok — yalnızca repo çağrıları.

import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { goalRepo, habitRepo, subtaskRepo, taskRepo } from '@/db';
import type { GoalType, HabitKind } from '@/db';
import { toYmd } from '@/lib/helpers';
import { scheduleHabitReminder } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
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

// Alışkanlık oluşturmada ilk adım: takip tipi seçimi (aşamalı sihirbaz).
const KIND_OPTIONS: { kind: HabitKind; emoji: string; titleKey: string; descKey: string }[] = [
  { kind: 'binary', emoji: '✓', titleKey: 'add.kindBinary', descKey: 'add.kindBinaryDesc' },
  { kind: 'numeric', emoji: '🔢', titleKey: 'add.kindNumeric', descKey: 'add.kindNumericDesc' },
  { kind: 'timer', emoji: '⏱️', titleKey: 'add.kindTimer', descKey: 'add.kindTimerDesc' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu' }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, notifyDataChanged } = useAppData();
  const [step, setStep] = useState<Step>(initialStep);
  const [title, setTitle] = useState('');
  // Alışkanlık sihirbazı: önce tip seçilir (null = tip seçim adımı).
  const [habitKind, setHabitKind] = useState<HabitKind | null>(null);

  // Hedef formu alanları (goals.tsx'ten taşındı).
  const [goalType, setGoalType] = useState<GoalType>('numeric');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Her açılışta istenen adıma (varsayılan menü) ve boş forma dön.
  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setTitle('');
      setHabitKind(null);
      setGoalType('numeric');
      setTarget('');
      setUnit('');
      setDeadline(null);
      setShowPicker(false);
    }
  }, [visible, initialStep]);

  // Ekleme sonrası: menüyü kapat, listeleri tazele, ilgili sekmeye git.
  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  // Görev, düzenleme paneliyle aynı TaskForm'la oluşturulur — öncelik, son tarih,
  // saat ve (isteğe bağlı) alt görevler oluşturma anında ayarlanabilir.
  const addTask = (values: TaskFormValues) => {
    const created = taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
    });
    // Taslak alt görevleri, görev yazıldıktan sonra sırayla oluştur.
    values.subtasks?.forEach((t) => subtaskRepo.create(created.id, t));
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

  const addGoal = () => {
    const t = title.trim();
    if (!t) return;
    if (goalType === 'numeric') {
      const targetNum = parseFloat(target.replace(',', '.'));
      goalRepo.create({
        user_id: user.id,
        title: t,
        goal_type: 'numeric',
        target_value: Number.isFinite(targetNum) ? targetNum : null,
        unit: unit.trim() || null,
      });
    } else {
      goalRepo.create({ user_id: user.id, title: t, goal_type: 'deadline', deadline });
    }
    finish('/(tabs)/goals');
  };

  const onPickDate = (_e: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDeadline(toYmd(picked));
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
                <Pressable
                  onPress={() => {
                    // Alışkanlık formundan geri → tip seçimine; başka her yerden → menü.
                    if (step === 'habit' && habitKind) setHabitKind(null);
                    else setStep('menu');
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? t('add.newTask') : step === 'habit' ? t('add.newHabit') : t('add.newGoal')}
                </Text>
                {/* başlığı ortalamak için sol taraftaki "‹ Geri" genişliğinde boşluk */}
                <View style={styles.headSpacer} />
              </View>

              {step === 'habit' ? (
                habitKind === null ? (
                  // 1. adım: takip tipini seç (tik / sayısal / zamanlayıcı).
                  <>
                    {KIND_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.kind}
                        style={styles.option}
                        onPress={() => setHabitKind(opt.kind)}
                      >
                        <View style={styles.optionIcon}>
                          <Text style={styles.optionEmoji}>{opt.emoji}</Text>
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
                  // 2. adım: düzenleme paneliyle aynı tam form (seçilen tiple).
                  <HabitForm
                    userId={user.id}
                    kind={habitKind}
                    submitLabel={t('common.add')}
                    autoFocusTitle
                    onSubmit={addHabit}
                  />
                )
              ) : step === 'task' ? (
                // Görev: düzenleme paneliyle aynı tam form (öncelik, tarih, saat)
                // + oluşturmada taslak alt görev ekleme.
                <TaskForm submitLabel={t('common.add')} autoFocusTitle enableSubtaskDraft onSubmit={addTask} />
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder={t('goal.titlePlaceholder')}
                    placeholderTextColor={colors.faint}
                    value={title}
                    onChangeText={setTitle}
                    autoFocus
                    returnKeyType="done"
                  />

                  {step === 'goal' && (
                    <>
                      <View style={styles.typeRow}>
                        {(['numeric', 'deadline'] as GoalType[]).map((g) => {
                          const selected = g === goalType;
                          return (
                            <Pressable
                              key={g}
                              style={[styles.typeChip, selected && styles.typeChipOn]}
                              onPress={() => setGoalType(g)}
                            >
                              <Text style={[styles.typeChipText, selected && styles.typeChipTextOn]}>
                                {g === 'numeric' ? t('goal.numeric') : t('goal.deadline')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {goalType === 'numeric' ? (
                        <View style={styles.inlineRow}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder={t('goal.targetPlaceholder')}
                            placeholderTextColor={colors.faint}
                            keyboardType="numeric"
                            value={target}
                            onChangeText={setTarget}
                          />
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder={t('goal.unitPlaceholder')}
                            placeholderTextColor={colors.faint}
                            value={unit}
                            onChangeText={setUnit}
                          />
                        </View>
                      ) : (
                        <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
                          <Text style={{ color: deadline ? colors.text : colors.faint, fontSize: 15 }}>
                            {deadline ? shortDate(deadline, lang) : t('goal.pickDeadline')}
                          </Text>
                        </Pressable>
                      )}

                      {showPicker && (
                        <DateTimePicker
                          value={deadline ? new Date(`${deadline}T00:00:00`) : new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          onChange={onPickDate}
                        />
                      )}
                    </>
                  )}

                  <Pressable style={styles.addBtn} onPress={addGoal}>
                    <Text style={styles.addBtnText}>{t('common.add')}</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },

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
    optionEmoji: { fontSize: 22 },
    optionBody: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    optionDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
    optionChevron: { fontSize: 22, color: c.faint, fontWeight: '600' },

    formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary, marginBottom: 16 },
    headSpacer: { width: 44 },

    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    typeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    typeChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    typeChipText: { fontSize: 14, fontWeight: '600', color: c.muted },
    typeChipTextOn: { color: c.onAccent },
    inlineRow: { flexDirection: 'row', gap: 8 },

    addBtn: {
      backgroundColor: c.primary,
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 15,
      marginTop: 4,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    addBtnText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
  });
