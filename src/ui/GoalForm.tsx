// Goal form fields, shared by creation (AddSheet) and editing (the Edit tab of
// app/goal/[id].tsx), like HabitForm. Saving and the modal belong to the caller.
// The type ('numeric' | 'milestone') and a numeric goal's unit kind are picked
// only at creation. The deadline is required (today by default). Steps can be
// drafted at creation; later they're managed in the goal's Steps tab.

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { GoalType } from '@/db';
import { isTimeUnit, TIME_UNIT, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeGoalFormStyles } from '@/ui/goalFormStyles';
import { longDateLabel, shortDate } from '@/ui/theme';

// A step drafted at creation, mirroring goal_milestones. amount is in SECONDS
// for duration goals (typed in minutes, like the detail screen).
export interface DraftMilestone {
  title: string;
  amount: number | null;
  due_date: string | null;
}

export interface GoalFormValues {
  title: string;
  goal_type: GoalType;
  target_value: number | null;
  unit: string | null;
  // Editing a numeric goal only; null at creation.
  current_value: number | null;
  deadline: string;
  remind_times: string[]; // daily "log your goal" reminders
  // Numeric only: day zero of the pace (goalProjection.ts).
  start_date: string | null;
  milestones?: DraftMilestone[]; // with enableMilestoneDraft
  // Editing: also record a manual "Current value" change as progress (default: a silent correction).
  log_manual_change?: boolean;
}

interface Props {
  goalType?: GoalType; // fixed when editing; omitted = picked at creation
  initial?: Partial<{
    title: string;
    target_value: number | null;
    unit: string | null;
    current_value: number;
    deadline: string | null;
    remind_times: string[];
    start_date: string | null;
  }>;
  submitLabel: string;
  onSubmit: (values: GoalFormValues) => void;
  onDelete?: () => void;
  autoFocusTitle?: boolean;
  enableMilestoneDraft?: boolean;
}

const TYPE_OPTIONS: { value: GoalType; labelKey: string }[] = [
  { value: 'numeric', labelKey: 'goal.numeric' },
  { value: 'milestone', labelKey: 'goal.milestoneType' },
];

export function GoalForm({
  goalType: fixedType,
  initial,
  submitLabel,
  onSubmit,
  onDelete,
  autoFocusTitle,
  enableMilestoneDraft,
}: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalFormStyles(colors);
  const isEditing = initial !== undefined;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [goalType, setGoalType] = useState<GoalType>(fixedType ?? 'numeric');
  // 'amount' (free unit) | 'time' (typed in minutes, stored in seconds —
  // helpers.TIME_UNIT). Fixed after creation: the stored value would change meaning.
  const initialIsTime = isTimeUnit(initial?.unit);
  const [unitMode, setUnitMode] = useState<'amount' | 'time'>(initialIsTime ? 'time' : 'amount');
  const [target, setTarget] = useState(
    initial?.target_value != null
      ? String(initialIsTime ? initial.target_value / 60 : initial.target_value)
      : ''
  );
  const [unit, setUnit] = useState(initialIsTime ? '' : initial?.unit ?? '');
  const [current, setCurrent] = useState(
    initial?.current_value != null
      ? String(initialIsTime ? initial.current_value / 60 : initial.current_value)
      : ''
  );
  const [logManualChange, setLogManualChange] = useState(false);
  const [deadline, setDeadline] = useState(initial?.deadline ?? todayDate());
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
  // Day zero of the pace; today at creation.
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayDate());
  const [showPicker, setShowPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<DraftMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState('');
  // Amount/date chips, as on the detail screen.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);

  const addDraftMilestone = () => {
    const m = newMilestone.trim();
    if (!m) return;
    // Numeric goals: an amount makes the step a threshold; empty = a checklist item.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goalType === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTime
          ? Math.round(parsedAmount * 60) // minutes -> seconds
          : parsedAmount
        : null;
    setDraftMilestones((prev) => [...prev, { title: m, amount, due_date: newMilestoneDate }]);
    setNewMilestone('');
    setNewMilestoneAmount('');
    setNewMilestoneDate(null);
    setShowMilestoneAmount(false);
  };
  const removeDraftMilestone = (i: number) =>
    setDraftMilestones((prev) => prev.filter((_, idx) => idx !== i));

  // A numeric goal needs a target and a unit.
  const isTime = goalType === 'numeric' && unitMode === 'time';
  const targetNumPreview = parseFloat(target.replace(',', '.'));
  const canSubmit =
    goalType !== 'numeric' ||
    (isTime
      ? Number.isFinite(targetNumPreview) && targetNumPreview > 0
      : Number.isFinite(targetNumPreview) && targetNumPreview > 0 && unit.trim().length > 0);

  const submit = () => {
    const tt = title.trim();
    if (!tt || !deadline || !canSubmit) return;
    const numeric = goalType === 'numeric';
    const targetNum = parseFloat(target.replace(',', '.'));
    const currentNum = parseFloat(current.replace(',', '.'));
    // Duration: minutes typed, seconds stored.
    const targetVal = Number.isFinite(targetNum) ? (isTime ? Math.round(targetNum * 60) : targetNum) : null;
    const currentVal = Number.isFinite(currentNum) ? (isTime ? Math.round(currentNum * 60) : currentNum) : null;
    onSubmit({
      title: tt,
      goal_type: goalType,
      target_value: numeric ? targetVal : null,
      unit: numeric ? (isTime ? TIME_UNIT : unit.trim() ? unit.trim() : null) : null,
      current_value: numeric && isEditing ? currentVal : null,
      deadline,
      remind_times: remindTimes,
      start_date: numeric ? startDate : null,
      milestones: enableMilestoneDraft ? draftMilestones : undefined,
      log_manual_change: numeric && isEditing ? logManualChange : undefined,
    });
  };

  const onPickDate = (picked: Date) => setDeadline(toYmd(picked));
  const onPickStartDate = (picked: Date) => setStartDate(toYmd(picked));

  return (
    <>
      <Text style={styles.label}>{t('goal.titleShort')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('goal.titlePlaceholder')}
        placeholderTextColor={colors.faint}
        autoFocus={autoFocusTitle}
        maxLength={TITLE_MAX_LEN}
      />
      <Text style={styles.counter}>
        {title.length}/{TITLE_MAX_LEN}
      </Text>

      {/* The type: picked at creation, display only when editing */}
      {fixedType ? (
        <Text style={styles.typeTag}>
          {t(fixedType === 'numeric' ? 'goal.typeNumeric' : 'goal.typeMilestone')}
        </Text>
      ) : (
        <>
          <Text style={styles.label}>{t('goal.type')}</Text>
          <View style={styles.row}>
            {TYPE_OPTIONS.map((opt) => {
              const sel = goalType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, sel && styles.chipSelected]}
                  onPress={() => setGoalType(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{t(opt.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {goalType === 'numeric' && (
        <>
          {!isEditing && (
            <>
              <Text style={styles.label}>{t('goal.unitTypeLabel')}</Text>
              <View style={styles.row}>
                <Pressable
                  style={[styles.chip, unitMode === 'amount' && styles.chipSelected]}
                  onPress={() => setUnitMode('amount')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: unitMode === 'amount' }}
                >
                  <Text style={[styles.chipText, unitMode === 'amount' && styles.chipTextSelected]}>
                    {t('goal.unitTypeAmount')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, unitMode === 'time' && styles.chipSelected]}
                  onPress={() => setUnitMode('time')}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: unitMode === 'time' }}
                >
                  <Text style={[styles.chipText, unitMode === 'time' && styles.chipTextSelected]}>
                    {t('goal.unitTypeTime')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {isTime ? (
            <>
              <Text style={styles.label}>{t('goal.durationTargetLabel')}</Text>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="numeric"
                placeholder={t('habit.durationPlaceholder')}
                placeholderTextColor={colors.faint}
                maxLength={NUMBER_MAX_LEN}
              />
              <Text style={styles.hint}>{t('goal.durationHint')}</Text>
            </>
          ) : (
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('goal.targetValue')}</Text>
                <TextInput
                  style={styles.input}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="numeric"
                  placeholder={t('goal.targetExample')}
                  placeholderTextColor={colors.faint}
                  maxLength={NUMBER_MAX_LEN}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>{t('goal.unit')}</Text>
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder={t('goal.unitExample')}
                  placeholderTextColor={colors.faint}
                  maxLength={UNIT_MAX_LEN}
                />
              </View>
            </View>
          )}

          {isEditing && (
            <>
              <Text style={styles.label}>
                {isTime ? t('goal.durationCurrentLabel') : t('goal.currentValue')}
              </Text>
              <TextInput
                style={styles.input}
                value={current}
                onChangeText={setCurrent}
                keyboardType="numeric"
                placeholder={isTime ? t('habit.durationPlaceholder') : t('goal.currentExample')}
                placeholderTextColor={colors.faint}
                maxLength={NUMBER_MAX_LEN}
              />
              {/* Checked: the change counts as progress (e.g. unlogged days
                  of reading); otherwise it's a silent correction. */}
              <Pressable
                style={styles.checkRow}
                onPress={() => setLogManualChange((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: logManualChange }}
                accessibilityLabel={t('goal.logManualChange')}
              >
                <View style={[styles.checkBox, logManualChange && styles.checkBoxOn]}>
                  {logManualChange && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.checkLabel}>{t('goal.logManualChange')}</Text>
              </Pressable>
              <Text style={styles.hint}>{t('goal.logManualChangeHint')}</Text>
            </>
          )}

          {/* Day zero of the pace; not later than today. */}
          <Text style={styles.label}>{t('goal.startDateLabel')}</Text>
          <View style={styles.row}>
            <Pressable
              style={styles.dateBtn}
              onPress={() => setShowStartPicker(true)}
              accessibilityRole="button"
              accessibilityLabel={t('goal.startDateLabel')}
            >
              <Text style={styles.dateBtnText}>{longDateLabel(startDate, lang, t('date.noDate'))}</Text>
            </Pressable>
          </View>
          <DatePickerModal
            visible={showStartPicker}
            value={new Date(`${startDate}T00:00:00`)}
            maximumDate={new Date(`${todayDate()}T00:00:00`)}
            onClose={() => setShowStartPicker(false)}
            onConfirm={onPickStartDate}
          />
        </>
      )}

      <Text style={styles.label}>{t('goal.deadlineLabel')}</Text>
      <View style={styles.row}>
        <Pressable
          style={styles.dateBtn}
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('goal.deadlineLabel')}
        >
          <Text style={styles.dateBtnText}>{longDateLabel(deadline, lang, t('date.noDate'))}</Text>
        </Pressable>
      </View>

      <DatePickerModal
        visible={showPicker}
        value={new Date(`${deadline}T00:00:00`)}
        onClose={() => setShowPicker(false)}
        onConfirm={onPickDate}
      />

      <ReminderListEditor label={t('goal.remindLabel')} times={remindTimes} onChange={setRemindTimes} />

      {/* Draft steps, created with the goal (both types, like the detail screen). */}
      {enableMilestoneDraft && (
        <>
          <Text style={styles.label}>{t('goal.milestonesOptional')}</Text>
          {draftMilestones.map((m, i) => (
            <View key={`${m.title}-${i}`} style={styles.subRow}>
              <View style={styles.subBullet} />
              <Text style={styles.subTitle}>{m.title}</Text>
              {(m.amount != null || m.due_date != null) && (
                <Text style={styles.subMeta}>
                  {[
                    m.amount != null
                      ? isTime
                        ? `${m.amount / 60} ${t('habit.durationPlaceholder')}`
                        : `${m.amount}${unit.trim() ? ` ${unit.trim()}` : ''}`
                      : null,
                    m.due_date != null ? shortDate(m.due_date, lang) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
              <Pressable
                onPress={() => removeDraftMilestone(i)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('goal.removeMilestoneA11y', { title: m.title })}
              >
                <Text style={styles.subDelete}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.subAddRow}>
            <TextInput
              style={styles.subInput}
              value={newMilestone}
              onChangeText={setNewMilestone}
              placeholder={t('goal.addMilestone')}
              placeholderTextColor={colors.faint}
              onSubmitEditing={addDraftMilestone}
              blurOnSubmit={false}
              returnKeyType="done"
              maxLength={TITLE_MAX_LEN}
            />
            <Pressable
              style={styles.subAddBtn}
              onPress={addDraftMilestone}
              accessibilityRole="button"
              accessibilityLabel={t('goal.addMilestone')}
            >
              <Text style={styles.subAddText}>＋</Text>
            </Pressable>
          </View>
          {(newMilestone.trim().length > 0 || newMilestoneDate != null || newMilestoneAmount.length > 0) && (
            <View style={styles.subChipRow}>
              {goalType === 'numeric' &&
                (showMilestoneAmount || newMilestoneAmount.length > 0 ? (
                  <TextInput
                    style={styles.subAmountInput}
                    value={newMilestoneAmount}
                    onChangeText={setNewMilestoneAmount}
                    placeholder={
                      isTime ? t('habit.durationPlaceholder') : unit.trim() || t('goal.milestoneAmountPlaceholder')
                    }
                    placeholderTextColor={colors.faint}
                    keyboardType="numeric"
                    maxLength={NUMBER_MAX_LEN}
                    autoFocus
                  />
                ) : (
                  <Pressable
                    style={styles.subChip}
                    onPress={() => setShowMilestoneAmount(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('goal.milestoneAmountPlaceholder')}
                  >
                    <Text style={styles.subChipText}>
                      #{' '}
                      {isTime ? t('habit.durationPlaceholder') : unit.trim() || t('goal.milestoneAmountPlaceholder')}
                    </Text>
                  </Pressable>
                ))}
              <Pressable
                style={[styles.subChip, newMilestoneDate != null && styles.subChipSet]}
                onPress={() => (newMilestoneDate ? setNewMilestoneDate(null) : setShowMilestoneDatePicker(true))}
                accessibilityRole="button"
                accessibilityLabel={t('goal.milestoneDueA11y')}
              >
                <Text style={[styles.subChipText, newMilestoneDate != null && styles.subChipTextSet]}>
                  <Feather name="calendar" size={12} color={newMilestoneDate != null ? colors.primary : colors.muted} />
                  {newMilestoneDate
                    ? ` ${shortDate(newMilestoneDate, lang)} ×`
                    : ` ${t('goal.milestoneDateChip')}`}
                </Text>
              </Pressable>
            </View>
          )}
          {goalType === 'numeric' && <Text style={styles.subHint}>{t('goal.milestoneThresholdHint')}</Text>}
          <DatePickerModal
            visible={showMilestoneDatePicker}
            value={new Date(`${newMilestoneDate ?? todayDate()}T00:00:00`)}
            onClose={() => setShowMilestoneDatePicker(false)}
            onConfirm={(picked) => setNewMilestoneDate(toYmd(picked))}
          />
        </>
      )}

      <View style={styles.actions}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Pressable
          style={[styles.saveBtn, !canSubmit && styles.saveBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          <Text style={styles.saveBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}
