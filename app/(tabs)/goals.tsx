// "Hedefler" sekmesi — iki tip hedef:
//  - numeric: ilerleme çubuğu + artır/azalt (örn. 40/100 km)
//  - deadline: bir tarihe kadar; kalan gün gösterilir
// Mimari kural: SQL yok; yalnızca goalRepo çağrılır.

import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { goalRepo } from '@/db';
import type { Goal, GoalType } from '@/db';
import { toYmd } from '@/lib/helpers';
import { useAppData } from '@/ui/AppData';
import { GoalEditModal } from '@/ui/GoalEditModal';
import { colors, deadlineLabel, shared, shortDate } from '@/ui/theme';

export default function GoalsScreen() {
  const { user } = useAppData();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null); // null = panel kapalı

  // Ekleme formu
  const [title, setTitle] = useState('');
  const [type, setType] = useState<GoalType>('numeric');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const reload = useCallback(() => {
    setGoals(goalRepo.listByUser(user.id));
    setConfirmId(null);
  }, [user.id]);

  useFocusEffect(reload);

  const resetForm = () => {
    setTitle('');
    setType('numeric');
    setTarget('');
    setUnit('');
    setDeadline(null);
    setShowPicker(false);
  };

  const addGoal = () => {
    const t = title.trim();
    if (!t) return;
    if (type === 'numeric') {
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
    resetForm();
    reload();
  };

  const onPickDate = (_e: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDeadline(toYmd(picked));
  };

  const step = (id: string, amount: number) => {
    goalRepo.addProgress(id, amount);
    reload();
  };

  const remove = (id: string) => {
    if (confirmId === id) {
      goalRepo.softDelete(id);
      reload();
    } else {
      setConfirmId(id);
    }
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <Text style={shared.greeting}>Hedefler</Text>
        <Text style={shared.subtitle}>Büyük resmi takip et</Text>

        {/* EKLEME FORMU */}
        <View style={styles.form}>
          <TextInput
            style={shared.input}
            placeholder="Hedef başlığı (örn. 100 km koş)"
            placeholderTextColor="#94a3b8"
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.typeRow}>
            {(['numeric', 'deadline'] as GoalType[]).map((g) => {
              const selected = g === type;
              return (
                <Pressable
                  key={g}
                  style={[styles.typeChip, selected && styles.typeChipOn]}
                  onPress={() => setType(g)}
                >
                  <Text style={[styles.typeChipText, selected && styles.typeChipTextOn]}>
                    {g === 'numeric' ? 'Sayısal' : 'Tarihli'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {type === 'numeric' ? (
            <View style={styles.inlineRow}>
              <TextInput
                style={[shared.input, { flex: 1 }]}
                placeholder="Hedef (örn. 100)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={target}
                onChangeText={setTarget}
              />
              <TextInput
                style={[shared.input, { flex: 1 }]}
                placeholder="Birim (km, kitap)"
                placeholderTextColor="#94a3b8"
                value={unit}
                onChangeText={setUnit}
              />
            </View>
          ) : (
            <Pressable style={shared.input} onPress={() => setShowPicker(true)}>
              <Text style={{ color: deadline ? colors.text : '#94a3b8', fontSize: 15 }}>
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

          <Pressable style={styles.addGoalBtn} onPress={addGoal}>
            <Text style={styles.addGoalBtnText}>Hedef ekle</Text>
          </Pressable>
        </View>

        {/* LİSTE */}
        {goals.length === 0 ? (
          <Text style={shared.empty}>Henüz hedef yok. İlk hedefini ekle.</Text>
        ) : (
          goals.map((goal) => {
            const ratio = goalRepo.progressRatio(goal);
            const armed = confirmId === goal.id;
            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHead}>
                  {/* Başlığa dokununca düzenleme paneli açılır */}
                  <Pressable style={styles.titleArea} onPress={() => setEditing(goal)}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(goal.id)} hitSlop={8}>
                    <Text style={[styles.del, armed && styles.delArmed]}>
                      {armed ? 'Emin?' : 'Sil'}
                    </Text>
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
                  <View style={styles.goalFoot}>
                    <Text style={styles.goalMeta}>
                      {goal.deadline ? shortDate(goal.deadline) : 'Tarih yok'}
                    </Text>
                    <Text style={styles.deadlineLeft}>{deadlineLabel(goal.deadline)}</Text>
                  </View>
                )}
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

const styles = StyleSheet.create({
  form: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    marginTop: 20,
    marginBottom: 24,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
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
  addGoalBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
    marginTop: 2,
  },
  addGoalBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  goalCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleArea: { flex: 1 },
  goalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  del: { fontSize: 13, fontWeight: '600', color: colors.faint, paddingLeft: 12 },
  delArmed: { color: '#dc2626' },

  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#eef2f7',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.primary },
  goalFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  goalMeta: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  steppers: { flexDirection: 'row', gap: 6 },
  stepBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
  },
  stepText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  deadlineLeft: { fontSize: 14, fontWeight: '700', color: colors.streak },
});
