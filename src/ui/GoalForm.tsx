// Goal form FIELDS — shared by both creation (AddSheet) and editing (the
// 'Edit' tab of app/goal/[id].tsx) (same pattern as Habit/TaskForm). Fields,
// state and validation live here; persistence (create/update), the milestone
// checklist section, and the modal/sheet shell belong to the caller. onSubmit
// hands the final (converted) values up.
//
// goal_type now takes two values: 'numeric' (progress bar) | 'milestone'
// (same logic as tasks/subtasks — can be split into steps). The type is only
// chosen at CREATION (via a chip at the top, if the goalType prop isn't
// passed), and is FIXED during editing (goalType prop is passed) — changing
// the type would leave fields inconsistent.
// Deadline now exists in BOTH types and is REQUIRED (same decision as
// TaskForm's due date) — defaults to today, no option to remove it.
// Milestones follow the exact same two-mode pattern as subtasks: a draft at
// creation (enableMilestoneDraft), an instantly-written checklist at editing
// (children).
// Architecture rule: no SQL — only the caller's repo writes.

import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
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

// A draft step added at creation time. Used to be a plain `string` (title
// only): since the step editor on the goal DETAIL screen could also take an
// amount and due date, the same thing existed in two different forms (user
// feedback). Fields map 1:1 to goal_milestones' own columns; amount is in
// SECONDS (time-unit goals take minutes as input and convert here — same rule
// as addMilestone on the detail screen).
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
  // Only meaningful for editing + numeric; null at creation (repo defaults to 0).
  current_value: number | null;
  deadline: string;
  remind_times: string[]; // daily-entry reminder times (0 or more)
  // Only meaningful for numeric (the tempo/projection zero day — goalProjection.ts);
  // null for milestone goals (no tempo calc for that type).
  start_date: string | null;
  milestones?: DraftMilestone[]; // only populated when enableMilestoneDraft
  // Only meaningful for editing + numeric: when "Current value" is changed by
  // hand, should the diff also be written to goal_entries and factored into
  // tempo/projection? Defaults to false (a pure correction — see the checkbox
  // description in GoalForm).
  log_manual_change?: boolean;
}

interface Props {
  goalType?: GoalType; // if fixed (editing), the type doesn't change; if omitted, chosen via a chip
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
  children?: ReactNode; // milestone checklist during editing (written instantly)
  enableMilestoneDraft?: boolean; // the draft milestone editor at creation
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
  children,
  enableMilestoneDraft,
}: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeGoalFormStyles(colors);
  const isEditing = initial !== undefined;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [goalType, setGoalType] = useState<GoalType>(fixedType ?? 'numeric');
  // Unit type for a numeric goal: 'amount' (free-form unit text) | 'time'
  // (duration — target/current_value stored in SECONDS, entered in minutes;
  // see helpers.TIME_UNIT). Only chosen at CREATION (like goalType itself) —
  // changing it during editing would shift the unit of the existing current_value.
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
  // Manually editing "Current value" is a pure CORRECTION by default (doesn't
  // affect tempo/projection); if the user is entering real retroactive
  // progress, they can check this to also write the diff into the entry
  // history (see handleEditSubmit at the end of the file).
  const [logManualChange, setLogManualChange] = useState(false);
  // Every goal now has a required deadline — defaults to today at creation
  // (same decision as TaskForm's due date), keeps the existing value when editing.
  const [deadline, setDeadline] = useState(initial?.deadline ?? todayDate());
  // Daily-entry reminder times — the same multi-reminder pattern as HabitForm.
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
  // The zero day for the tempo/projection calculation (see goalProjection.ts) —
  // only meaningful for numeric. Defaults to today at creation (exactly the
  // design decision: "the goal I open today has today as its first day").
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayDate());
  const [showPicker, setShowPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<DraftMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState('');
  // Amount/date, the same progressive chips as the detail screen
  // (app/goal/[id].tsx): keep the title row plain, extras a tap away.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);

  const addDraftMilestone = () => {
    const m = newMilestone.trim();
    if (!m) return;
    // Amount is only meaningful for numeric goals (the SAME rule as
    // addMilestone on the detail screen): if filled in, the step becomes its
    // own independent threshold; if empty, it's a plain checklist item.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goalType === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTime
          ? Math.round(parsedAmount * 60) // entered in minutes, stored in seconds
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

  // For a numeric goal, amount+unit are required — otherwise target_value/unit
  // would stay null, creating a "goalless" goal whose progress bar is
  // meaningless (same rule as the numeric habit in HabitForm, see trackingTargetValid).
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
    // In duration mode it's entered in minutes and converted to seconds for
    // storage (the same pattern as the habit timer).
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
      {/* Title */}
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

      {/* Type — only chosen at creation; FIXED during editing (display only) */}
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

      {/* Numeric fields */}
      {goalType === 'numeric' && (
        <>
          {/* Unit type — only chosen at creation (FIXED like goalType;
              changing it during editing would shift the unit of the existing current_value). */}
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
              {/* Default: this field is a pure CORRECTION, doesn't affect
                  tempo/projection (see the GoalFormValues.log_manual_change
                  comment). If checked, the diff is also written to the entry
                  history — for retroactive real-progress entry scenarios
                  (e.g. reading that hasn't been logged for a few days). */}
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

          {/* The zero day for the tempo/projection calculation — things like the
              "Last 7 days" average are capped by the actual number of days
              elapsed since this date (see goalProjection.ts). A date later than
              today can't be picked. */}
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

      {/* Deadline — now required in both types, cannot be removed */}
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

      {/* Daily-entry reminders — optional, multiple can be added ("don't forget
          to log this goal" notifications arrive at these times). */}
      <ReminderListEditor label={t('goal.remindLabel')} times={remindTimes} onChange={setRemindTimes} />

      {/* Milestone checklist during editing (written instantly, provided by the
          parent) — no longer used: steps are now managed in a separate 'Steps'
          tab in app/goal/[id].tsx. */}
      {goalType === 'milestone' && children}

      {/* The draft step editor at creation (created together with the goal
          when submitted). BROUGHT IN SYNC with the step editor on the detail
          screen (app/goal/[id].tsx):
          - now visible for BOTH goal types (steps are valid for both; it used
            to only open for 'milestone' type, yet a step could later be added
            to a numeric goal too — the same thing existing in two different forms),
          - title row stays plain, amount/date live in progressive chips. */}
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
                  {newMilestoneDate
                    ? `📅 ${shortDate(newMilestoneDate, lang)} ×`
                    : `📅 ${t('goal.milestoneDateChip')}`}
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

      {/* Actions — Delete only during editing (when onDelete is provided) */}
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
