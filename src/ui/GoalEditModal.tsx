// Hedef düzenleme paneli (sayfayı ortalayan modal).
// "Hedefler" ekranında bir hedefin başlığına dokununca açılır. Alanların tamamı
// ortak GoalForm bileşeninde; burası yalnızca modal kabuğu + kalıcılık
// (update/delete), milestone checklist bölümü (anında yazılır — TaskEditModal'daki
// alt görev desenin aynısı) ve üstte küçük bir "anlık durum" istatistik şeridi.
// goal_type DEĞİŞTİRİLMEZ — tip değişimi alanları tutarsız bırakır (salt gösterilir,
// GoalForm'a goalType sabit verilir).
// Mimari kural: SQL yok - yalnızca goalRepo/goalMilestoneRepo çağrılır.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { goalMilestoneRepo, goalRepo } from '@/db';
import type { Goal, GoalMilestone } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { deadlineLabel, type Colors } from '@/ui/theme';

interface Props {
  goal: Goal | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

// Tam sayıysa ondalık gösterme (AmountStepper'daki fmt ile aynı desen).
function fmtNum(n: number): string {
  return n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100);
}

export function GoalEditModal({ goal, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState('');

  // Panel her açıldığında adımları seçilen hedeften yükle.
  useEffect(() => {
    if (goal) {
      setMilestones(goalMilestoneRepo.listByGoal(goal.id));
      setNewMilestone('');
    }
  }, [goal]);

  if (!goal) return null;

  // Tüm adımlar tamamlanınca hedefi otomatik tamamlar; biri geri açılırsa (ya da
  // yeni tamamlanmamış adım eklenirse) hedefi de geri açar. Adımı olmayan bir
  // hedefte bu kural hiç devreye girmez (TaskEditModal.syncParentCompletion ile
  // birebir aynı desen).
  const syncGoalCompletion = () => {
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
    setMilestones(goalMilestoneRepo.listByGoal(goal.id));
    onChanged();
  };

  const addMilestone = () => {
    const v = newMilestone.trim();
    if (!v) return;
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

  const handleSubmit = (values: GoalFormValues) => {
    goalRepo.update(goal.id, {
      title: values.title,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      ...(values.current_value != null ? { current_value: values.current_value } : {}),
    });
    onChanged();
    onClose();
  };

  const handleDelete = () => {
    goalRepo.softDelete(goal.id);
    onChanged();
    onClose();
  };

  // "Anlık durum" — yeni bir geçmiş tablosu gerektirmeyen, mevcut alanlardan
  // hesaplanan hafif istatistik şeridi (bkz. kullanıcıyla konuşulan kapsam kararı).
  const ratio = goalRepo.progressRatio(goal);
  const remaining = goal.target_value != null ? Math.max(0, goal.target_value - goal.current_value) : null;
  const dLabel = deadlineLabel(goal.deadline, {
    daysLeft: (n) => t('date.daysLeft', { n }),
    dueToday: t('date.dueToday'),
    daysAgo: (n) => t('date.daysAgo', { n }),
  });

  return (
    <ModalCard visible onClose={onClose}>
        <Text style={styles.heading}>{t('goal.edit')}</Text>

        {/* Anlık durum */}
        <View style={styles.statsRow}>
          {goal.goal_type === 'numeric' ? (
            <>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>%{Math.round(ratio * 100)}</Text>
                <Text style={styles.statLabel}>{t('goal.statRatio')}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {remaining != null ? fmtNum(remaining) : '–'}
                  {goal.unit ? ` ${goal.unit}` : ''}
                </Text>
                <Text style={styles.statLabel}>{t('goal.statRemaining')}</Text>
              </View>
            </>
          ) : (
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {milestones.filter((m) => m.completed === 1).length}/{milestones.length}
              </Text>
              <Text style={styles.statLabel}>{t('goal.statMilestones')}</Text>
            </View>
          )}
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dLabel || '–'}</Text>
            <Text style={styles.statLabel}>{t('goal.statDeadline')}</Text>
          </View>
        </View>

        <GoalForm
          key={goal.id}
          goalType={goal.goal_type}
          initial={goal}
          submitLabel={t('common.save')}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
        >
          {/* Adımlar — anında kaydedilir (Kaydet beklemez) */}
          <Text style={styles.label}>{t('goal.milestones')}</Text>
          {milestones.map((m) => {
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
        </GoalForm>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8, marginTop: 4 },

    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      alignItems: 'center',
    },
    statValue: { fontSize: 16, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 11, color: c.muted, marginTop: 4, textAlign: 'center' },

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
    milestoneAddRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
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
