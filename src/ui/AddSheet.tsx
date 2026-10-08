// The add form behind the central ＋ (a centered modal). It usually opens
// straight on the picked type's form (initialStep); "‹ Back" returns to the
// type menu. Every type is created with its full form — the same one its edit
// screen uses. After adding: refresh the lists and go to that tab.

import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goalMilestoneRepo, goalRepo, habitRepo, reminderRepo, subtaskRepo, taskRepo } from '@/db';
import { scheduleGoalReminders, scheduleHabitReminders, scheduleTaskReminders } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { useFriends } from '@/ui/sharedTaskUi';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import type { Colors } from '@/ui/theme';

export type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Omitted = the type menu.
  initialStep?: Step;
  // The task form opens with the mic already listening.
  autoVoice?: boolean;
}

const MENU_OPTIONS: { step: Step; type: EntityType; titleKey: string; descKey: string }[] = [
  { step: 'task', type: 'task', titleKey: 'add.task', descKey: 'add.taskDesc' },
  { step: 'habit', type: 'habit', titleKey: 'add.habit', descKey: 'add.habitDesc' },
  { step: 'goal', type: 'goal', titleKey: 'add.goal', descKey: 'add.goalDesc' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu', autoVoice = false }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user, notifyDataChanged, selectedDate } = useAppData();
  const [step, setStep] = useState<Step>(initialStep);
  // Cleared once the user picks a type from the menu: only the first form listens.
  const [listenNow, setListenNow] = useState(autoVoice);
  const friends = useFriends(visible);

  useEffect(() => {
    if (visible) {
      setStep(initialStep);
      setListenNow(autoVoice);
    }
  }, [visible, initialStep, autoVoice]);

  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  const addTask = (values: TaskFormValues) => {
    const created = taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
      recurrence: values.recurrence,
      shared_with_id: values.shared_with_id,
      icon: values.icon,
      tag_ids: values.tag_ids,
    });
    values.subtasks?.forEach((sub) => subtaskRepo.create(created.id, sub));
    const reminders = reminderRepo.replaceAll('task', created.id, values.remind_times);
    scheduleTaskReminders(created, reminders).then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    finish('/(tabs)/tasks');
  };

  const addHabit = (values: HabitFormValues) => {
    const created = habitRepo.create({ user_id: user.id, ...values });
    // Warns if notification permission is missing.
    const reminders = reminderRepo.replaceAll('habit', created.id, values.remind_times);
    if (reminders.length > 0) {
      scheduleHabitReminders(created, reminders).then((ok) => {
        if (!ok) {
          Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
        }
      });
    }
    finish('/(tabs)/habits');
  };

  const addGoal = (values: GoalFormValues) => {
    const created = goalRepo.create({
      user_id: user.id,
      title: values.title,
      goal_type: values.goal_type,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
      start_date: values.start_date,
    });
    values.milestones?.forEach((m) =>
      goalMilestoneRepo.create(created.id, m.title, { amount: m.amount, due_date: m.due_date })
    );
    // Warns if notification permission is missing.
    const reminders = reminderRepo.replaceAll('goal', created.id, values.remind_times);
    if (reminders.length > 0) {
      scheduleGoalReminders(created, reminders).then((ok) => {
        if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
      });
    }
    finish('/(tabs)/goals');
  };

  return (
    <ModalCard visible={visible} onClose={onClose}>
          {step === 'menu' ? (
            <>
              <Text style={styles.heading}>{t('add.menuTitle')}</Text>
              {MENU_OPTIONS.map((opt) => (
                <Pressable key={opt.step} style={styles.option} onPress={() => {
                  setListenNow(false);
                  setStep(opt.step);
                }}>
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
            // ModalCard scrolls its content.
            <>
              <View style={styles.formHead}>
                <Pressable onPress={() => setStep('menu')} hitSlop={8}>
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? t('add.newTask') : step === 'habit' ? t('add.newHabit') : t('add.newGoal')}
                </Text>
                {/* balances "‹ Back" so the title is centered */}
                <View style={styles.headSpacer} />
              </View>

              {step === 'habit' ? (
                // No `kind`: the wizard's first step picks it.
                <HabitForm
                  userId={user.id}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  stepped
                  onSubmit={addHabit}
                />
              ) : step === 'task' ? (
                // Due date defaults to the day shown on Today.
                <TaskForm
                  initial={{ due_date: selectedDate }}
                  submitLabel={t('common.add')}
                  autoFocusTitle={!listenNow}
                  enableSubtaskDraft
                  enableVoice
                  autoStartVoice={listenNow}
                  shareFriends={friends}
                  onSubmit={addTask}
                />
              ) : (
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
    // Rounded soft box behind the icon.
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
