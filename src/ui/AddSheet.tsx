// The add form opened by the central ＋ button (a centered modal — not a
// bottom sheet). Since the ＋ menu usually already picks the type, it opens
// directly on the relevant form (initialStep); "‹ Back" returns to the type
// selection menu.
// All types are added with FULL settings right at creation time: task
// (TaskForm) and habit (HabitForm) share the same form as their edit panels;
// goal has its own full form (moved from goals.tsx). After adding,
// notifyDataChanged refreshes the lists on open screens and navigates to the
// relevant tab.
// Architecture rule: no SQL — repo calls only.

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
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import type { Colors } from '@/ui/theme';

export type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  // The step to jump to directly when opened. Since the central ＋ menu
  // usually already picks a type, a form step is generally passed; if not,
  // the type selection menu opens.
  initialStep?: Step;
}

// Text is kept as i18n keys and translated with t() at render time. Icons come
// from EntityIcon, the same line-icon set used in the tab bar (for consistency).
const MENU_OPTIONS: { step: Step; type: EntityType; titleKey: string; descKey: string }[] = [
  { step: 'task', type: 'task', titleKey: 'add.task', descKey: 'add.taskDesc' },
  { step: 'habit', type: 'habit', titleKey: 'add.habit', descKey: 'add.habitDesc' },
  { step: 'goal', type: 'goal', titleKey: 'add.goal', descKey: 'add.goalDesc' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu' }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user, notifyDataChanged, selectedDate } = useAppData();
  const [step, setStep] = useState<Step>(initialStep);

  // Return to the requested step (default menu) on every open.
  useEffect(() => {
    if (visible) setStep(initialStep);
  }, [visible, initialStep]);

  // After adding: close the menu, refresh the lists, navigate to the relevant tab.
  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  // A task is created with the same TaskForm as the edit panel — priority, due
  // date, time, and (optionally) subtasks can all be set at creation time.
  const addTask = (values: TaskFormValues) => {
    const created = taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
      recurrence: values.recurrence,
    });
    // Create the draft subtasks in order, after the task itself is written.
    values.subtasks?.forEach((sub) => subtaskRepo.create(created.id, sub));
    // If reminder times were chosen, notifications are set up right away (no-op otherwise).
    const reminders = reminderRepo.replaceAll('task', created.id, values.remind_times);
    scheduleTaskReminders(created, reminders).then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    finish('/(tabs)/tasks');
  };

  // A habit is created with the same HabitForm as the edit panel — all
  // settings (icon, color, frequency, date range, numeric target, reminders,
  // linking to a goal) can be set at creation time.
  const addHabit = (values: HabitFormValues) => {
    const created = habitRepo.create({ user_id: user.id, ...values });
    // If reminder times were chosen, schedule notifications (warn if permission is missing).
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

  // A goal is created with the same GoalForm as the edit panel — the type
  // (numeric/milestone) is only chosen here, the deadline is required, and
  // draft milestones are written together with the goal.
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
    // If daily-entry reminders were chosen, they're set up right away (warn if
    // permission is missing — same pattern as habit/task creation; the result
    // used to not be checked at all).
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
            // ModalCard already wraps its content in a ScrollView (the long
            // habit form scrolls safely, the "Add" button never gets clipped).
            <>
              <View style={styles.formHead}>
                <Pressable onPress={() => setStep('menu')} hitSlop={8}>
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? t('add.newTask') : step === 'habit' ? t('add.newHabit') : t('add.newGoal')}
                </Text>
                {/* spacer the width of the "‹ Back" on the left, to center the title */}
                <View style={styles.headSpacer} />
              </View>

              {step === 'habit' ? (
                // The tracking type (checkbox/numeric/timer) is the wizard's own
                // first step — `kind` isn't passed to HabitForm; the user picks it in stepped mode.
                <HabitForm
                  userId={user.id}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  stepped
                  onSubmit={addHabit}
                />
              ) : step === 'task' ? (
                // Task: the same full form as the edit panel (priority, date, time)
                // + adding draft subtasks at creation time. The due date defaults to
                // whichever day is currently viewed on the "Today" screen
                // (selectedDate) — so a task added while viewing Friday goes to Friday.
                <TaskForm
                  initial={{ due_date: selectedDate }}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  enableSubtaskDraft
                  onSubmit={addTask}
                />
              ) : (
                // Goal: the same GoalForm as the edit panel — the type
                // (numeric/milestone) is only chosen when creating.
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
    // Rounded soft box for the emoji (premium feel).
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
