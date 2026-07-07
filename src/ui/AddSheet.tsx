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
import { goalRepo, habitRepo, taskRepo } from '@/db';
import type { GoalType, HabitKind } from '@/db';
import { toYmd } from '@/lib/helpers';
import { scheduleHabitReminder } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { colors, shortDate } from '@/ui/theme';

export type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Açılırken doğrudan gidilecek adım. Merkezi ＋ menüsü türü kendi seçtiği
  // için genelde bir form adımı verilir; verilmezse tür seçim menüsü açılır.
  initialStep?: Step;
}

const MENU_OPTIONS: { step: Step; emoji: string; title: string; desc: string }[] = [
  { step: 'task', emoji: '✅', title: 'Görev', desc: 'Tek seferlik yapılacak iş' },
  { step: 'habit', emoji: '🔥', title: 'Alışkanlık', desc: 'Düzenli tekrarlanan rutin' },
  { step: 'goal', emoji: '🎯', title: 'Hedef', desc: 'Sayısal ya da tarihli büyük hedef' },
];

// Alışkanlık oluşturmada ilk adım: takip tipi seçimi (aşamalı sihirbaz).
const KIND_OPTIONS: { kind: HabitKind; emoji: string; title: string; desc: string }[] = [
  { kind: 'binary', emoji: '✓', title: 'Basit (tik)', desc: 'Yaptım / yapmadım' },
  { kind: 'numeric', emoji: '🔢', title: 'Sayısal değer', desc: 'Miktar hedefi — ör. 8 bardak su' },
  { kind: 'timer', emoji: '⏱️', title: 'Zamanlayıcı', desc: 'Geri sayım — ör. 20 dk meditasyon' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu' }: Props) {
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

  // Görev, düzenleme paneliyle aynı TaskForm'la oluşturulur — öncelik, son tarih
  // ve saat oluşturma anında ayarlanabilir (alt görevler yalnız sonradan).
  const addTask = (values: TaskFormValues) => {
    taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
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
          Alert.alert(
            'Bildirim izni yok',
            'Hatırlatma kaydedildi ama bildirim gönderebilmek için izin gerekiyor. Telefon ayarlarından bu uygulamaya bildirim izni verebilirsin.'
          );
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
              <Text style={styles.heading}>Ne eklemek istersin?</Text>
              {MENU_OPTIONS.map((opt) => (
                <Pressable key={opt.step} style={styles.option} onPress={() => setStep(opt.step)}>
                  <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{opt.title}</Text>
                    <Text style={styles.optionDesc}>{opt.desc}</Text>
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
                  <Text style={styles.backText}>‹ Geri</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? 'Yeni görev' : step === 'habit' ? 'Yeni alışkanlık' : 'Yeni hedef'}
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
                        <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                        <View style={styles.optionBody}>
                          <Text style={styles.optionTitle}>{opt.title}</Text>
                          <Text style={styles.optionDesc}>{opt.desc}</Text>
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
                    submitLabel="Ekle"
                    autoFocusTitle
                    onSubmit={addHabit}
                  />
                )
              ) : step === 'task' ? (
                // Görev: düzenleme paneliyle aynı tam form (öncelik, tarih, saat).
                <TaskForm submitLabel="Ekle" autoFocusTitle onSubmit={addTask} />
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Hedef başlığı (örn. 100 km koş)"
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
                                {g === 'numeric' ? 'Sayısal' : 'Tarihli'}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      {goalType === 'numeric' ? (
                        <View style={styles.inlineRow}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder="Hedef (örn. 100)"
                            placeholderTextColor={colors.faint}
                            keyboardType="numeric"
                            value={target}
                            onChangeText={setTarget}
                          />
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            placeholder="Birim (km, kitap)"
                            placeholderTextColor={colors.faint}
                            value={unit}
                            onChangeText={setUnit}
                          />
                        </View>
                      ) : (
                        <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
                          <Text style={{ color: deadline ? colors.text : colors.faint, fontSize: 15 }}>
                            {deadline ? shortDate(deadline) : 'Son tarih seç'}
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
                    <Text style={styles.addBtnText}>Ekle</Text>
                  </Pressable>
                </>
              )}
            </>
          )}
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16, textAlign: 'center' },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  optionEmoji: { fontSize: 24, marginRight: 12 },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  optionDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  optionChevron: { fontSize: 22, color: colors.faint, fontWeight: '600' },

  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backText: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 16 },
  headSpacer: { width: 44 },

  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  typeChipTextOn: { color: '#fff' },
  inlineRow: { flexDirection: 'row', gap: 8 },

  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
