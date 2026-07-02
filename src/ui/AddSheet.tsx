// Merkezi ＋ butonunun açtığı ekleme menüsü (alttan açılan modal).
// İki adım: (1) tür seçimi — Görev / Alışkanlık / Hedef, (2) seçilen türün
// mini ekleme formu. Görev ve alışkanlık yalnızca başlıkla eklenir (ayrıntılar
// düzenleme panelinden); hedef, tipi sonradan değiştirilemediği için tam
// formuyla eklenir (goals.tsx'teki eski ekleme formunun taşınmış hali).
// Ekleme sonrası notifyDataChanged ile açık ekranların listeleri tazelenir ve
// ilgili sekmeye gidilir. Mimari kural: SQL yok — yalnızca repo çağrıları.

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { goalRepo, habitRepo, taskRepo } from '@/db';
import type { GoalType } from '@/db';
import { toYmd } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { colors, shortDate } from '@/ui/theme';

type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const MENU_OPTIONS: { step: Step; emoji: string; title: string; desc: string }[] = [
  { step: 'task', emoji: '✅', title: 'Görev', desc: 'Tek seferlik yapılacak iş' },
  { step: 'habit', emoji: '🔥', title: 'Alışkanlık', desc: 'Düzenli tekrarlanan rutin' },
  { step: 'goal', emoji: '🎯', title: 'Hedef', desc: 'Sayısal ya da tarihli büyük hedef' },
];

export function AddSheet({ visible, onClose }: Props) {
  const { user, notifyDataChanged } = useAppData();
  const [step, setStep] = useState<Step>('menu');
  const [title, setTitle] = useState('');

  // Hedef formu alanları (goals.tsx'ten taşındı).
  const [goalType, setGoalType] = useState<GoalType>('numeric');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Her açılışta menü adımına ve boş forma dön.
  useEffect(() => {
    if (visible) {
      setStep('menu');
      setTitle('');
      setGoalType('numeric');
      setTarget('');
      setUnit('');
      setDeadline(null);
      setShowPicker(false);
    }
  }, [visible]);

  // Ekleme sonrası: menüyü kapat, listeleri tazele, ilgili sekmeye git.
  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  const addTask = () => {
    const t = title.trim();
    if (!t) return;
    taskRepo.create({ user_id: user.id, title: t, priority: 'medium' });
    finish('/(tabs)/tasks');
  };

  const addHabit = () => {
    const t = title.trim();
    if (!t) return;
    habitRepo.create({ user_id: user.id, title: t });
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

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

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
            <>
              <View style={styles.formHead}>
                <Pressable onPress={() => setStep('menu')} hitSlop={8}>
                  <Text style={styles.backText}>‹ Geri</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? 'Yeni görev' : step === 'habit' ? 'Yeni alışkanlık' : 'Yeni hedef'}
                </Text>
                {/* başlığı ortalamak için sol taraftaki "‹ Geri" genişliğinde boşluk */}
                <View style={styles.headSpacer} />
              </View>

              <TextInput
                style={styles.input}
                placeholder={
                  step === 'task'
                    ? 'Görev başlığı'
                    : step === 'habit'
                      ? 'Alışkanlık başlığı'
                      : 'Hedef başlığı (örn. 100 km koş)'
                }
                placeholderTextColor={colors.faint}
                value={title}
                onChangeText={setTitle}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={step === 'task' ? addTask : step === 'habit' ? addHabit : undefined}
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

              <Pressable
                style={styles.addBtn}
                onPress={step === 'task' ? addTask : step === 'habit' ? addHabit : addGoal}
              >
                <Text style={styles.addBtnText}>Ekle</Text>
              </Pressable>

              {step !== 'goal' && (
                <Text style={styles.hint}>
                  {step === 'task'
                    ? 'Tarih, saat ve önceliği eklendikten sonra görevine dokunarak ayarlayabilirsin.'
                    : 'İkon, renk, sıklık ve hedefi eklendikten sonra alışkanlığına dokunarak ayarlayabilirsin.'}
                </Text>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
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
  hint: { fontSize: 12, color: colors.faint, lineHeight: 17, marginTop: 12, textAlign: 'center' },
});
