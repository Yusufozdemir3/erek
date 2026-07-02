// "Hedefler" sekmesi — iki tip hedef:
//  - numeric: ilerleme çubuğu + artır/azalt (örn. 40/100 km)
//  - deadline: bir tarihe kadar; kalan gün gösterilir
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır (form AddSheet'te).
// Mimari kural: SQL yok; yalnızca goalRepo çağrılır.

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { goalRepo } from '@/db';
import type { Goal } from '@/db';
import { useAppData } from '@/ui/AppData';
import { GoalEditModal } from '@/ui/GoalEditModal';
import { ProfileButton } from '@/ui/ProfileButton';
import { colors, deadlineLabel, shared, shortDate } from '@/ui/theme';

export default function GoalsScreen() {
  const { user, dataVersion } = useAppData();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Goal | null>(null); // null = panel kapalı

  const reload = useCallback(() => {
    setGoals(goalRepo.listByUser(user.id));
    setConfirmId(null);
    // dataVersion: ＋ menüsünden hedef eklenince odak değişmeden tazelensin.
  }, [user.id, dataVersion]);

  useFocusEffect(reload);

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
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>Hedefler</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>Büyük resmi takip et</Text>

        {/* LİSTE */}
        {goals.length === 0 ? (
          <Text style={[shared.empty, { marginTop: 20 }]}>
            Henüz hedef yok. Alttaki ＋ ile ekleyebilirsin.
          </Text>
        ) : (
          goals.map((goal, i) => {
            const ratio = goalRepo.progressRatio(goal);
            const armed = confirmId === goal.id;
            return (
              <View key={goal.id} style={[styles.goalCard, i === 0 && { marginTop: 20 }]}>
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
