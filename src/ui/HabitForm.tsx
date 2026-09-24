// Habit form FIELDS — shared by both creation (AddSheet) and editing
// (HabitEditModal). A single source: fields, state and validation live here;
// persistence (create/update), notification scheduling, and the modal/sheet
// shell belong to the caller. onSubmit hands the final (converted) values up.
// The parent remounts via `key` for a fresh start when the goal/habit changes.
// Architecture rule: no SQL — only goalRepo (read-only, for the goal-linking list).
//
// STEPPED (wizard) MODE: when `stepped` is true (creation only, AddSheet),
// fields are split into 3-4 steps shown one at a time — Identity
// (title+icon+color) → Frequency → Tracking (if any) → Reminder. When
// `stepped` is false/omitted (editing, HabitEditModal), ALL fields are shown
// in one long scroll as before — the same JSX pieces, only the visibility
// condition changes; field ORDER or logic doesn't change, the edit flow's
// behavior is preserved exactly.

import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { goalRepo } from '@/db';
import type { Goal, GoalContribution, HabitKind, Recurrence } from '@/db';
import { isQuotaSchedule, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { SHORT_NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeHabitFormStyles } from '@/ui/habitFormStyles';
import { HabitAppearancePicker } from '@/ui/habit/HabitAppearancePicker';
import {
  buildSchedule,
  buildTarget,
  clampEndDate,
  ratioToGoalFactor,
  type FreqMode as HabitFreqMode,
} from '@/lib/habitFormLogic';
import { DEFAULT_HABIT_COLOR, shortDate } from '@/ui/theme';

// Day buttons in the frequency picker (Monday to Sunday; wd = JS getDay).
// Labels are i18n keys, translated with t() at render time.
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

// Maps 1:1 to the fields habitRepo.create/update expect.
export interface HabitFormValues {
  title: string;
  kind: HabitKind;
  remind_times: string[];
  icon: string | null;
  color: string | null;
  schedule: Recurrence | null;
  target_amount: number | null; // numeric: amount · timer: target in SECONDS · binary: null
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  goal_id: string | null;
  goal_contribution: GoalContribution | null; // only meaningful if goal_id is set; NULL = per_completion
  goal_factor: number;                        // only meaningful in 'amount' mode
}

interface Props {
  userId: string;                       // the goal-linking list comes from this user
  // Tracking type. If provided, it's FIXED (editing — the type never changes
  // after creation). If omitted (creation), the wizard's first step ('kind')
  // lets the user pick it.
  kind?: HabitKind;
  initial?: Partial<HabitFormValues>;   // editing: current values; creation: none (defaults)
  submitLabel: string;                  // "Save" | "Add"
  onSubmit: (values: HabitFormValues) => void;
  onDelete?: () => void;                // editing only: the Delete button
  autoFocusTitle?: boolean;             // open the keyboard immediately at creation
  stepped?: boolean;                    // wizard mode (creation only — see the header comment)
}

type WizardStep = 'kind' | 'identity' | 'schedule' | 'tracking' | 'reminder';
// Frequency mode (UI state; converted to Recurrence on submit — see submit).
// The four frequency modes are defined in lib/habitFormLogic.ts (which does the conversion).
type FreqMode = HabitFreqMode;

// Tracking type selection — the wizard's first step (creation only, when the
// type isn't fixed). Uses the same line-vector language as the icon set
// (Feather) instead of emoji.
const KIND_OPTIONS: { kind: HabitKind; name: keyof typeof Feather.glyphMap; titleKey: string; descKey: string }[] = [
  { kind: 'binary', name: 'check-circle', titleKey: 'add.kindBinary', descKey: 'add.kindBinaryDesc' },
  { kind: 'numeric', name: 'hash', titleKey: 'add.kindNumeric', descKey: 'add.kindNumericDesc' },
  { kind: 'timer', name: 'clock', titleKey: 'add.kindTimer', descKey: 'add.kindTimerDesc' },
];

export function HabitForm({
  userId,
  kind: fixedKind,
  initial,
  submitLabel,
  onSubmit,
  onDelete,
  autoFocusTitle,
  stepped,
}: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeHabitFormStyles(colors);
  const initSchedule = initial?.schedule ?? null;
  // Type: from the fixed value if provided (editing); otherwise (creation) the
  // user picks it in the wizard's first step (null = not chosen yet).
  const [kind, setKind] = useState<HabitKind | null>(fixedKind ?? initial?.kind ?? null);
  const initWeekly =
    !!initSchedule && initSchedule.freq === 'weekly' && (initSchedule.weekdays?.length ?? 0) > 0;
  // Four frequency modes: every day / specific days of the week / every X days /
  // X times a week (a flexible quota — no days picked, just hit a weekly count).
  const initFreqMode: FreqMode = !initSchedule
    ? 'daily'
    : initSchedule.freq === 'interval'
      ? 'interval'
      : isQuotaSchedule(initSchedule)
        ? 'quota'
        : initWeekly
          ? 'days'
          : 'daily';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [freqMode, setFreqMode] = useState<FreqMode>(initFreqMode);
  const [weekdays, setWeekdays] = useState<number[]>(initWeekly ? initSchedule!.weekdays! : []);
  // interval: every how many days (text; >=2 is valid, otherwise falls back to "every day").
  const [everyNText, setEveryNText] = useState(
    initSchedule?.freq === 'interval' ? String(initSchedule.every ?? 2) : '2'
  );
  // quota: how many times a week (1-7).
  const [quotaText, setQuotaText] = useState(
    isQuotaSchedule(initSchedule) ? String(initSchedule!.timesPerWeek) : '3'
  );
  // Numeric: amount (e.g. 8). Timer: target in MINUTES (converted to seconds). Kept as text.
  const [targetText, setTargetText] = useState(
    initial?.target_amount == null
      ? ''
      : kind === 'timer'
        ? String(initial.target_amount / 60)
        : String(initial.target_amount)
  );
  const [unit, setUnit] = useState(initial?.unit ?? '');
  // At CREATION (no initial), defaults to TODAY — the most common scenario is
  // tracking "starting today". At EDITING, the existing value is kept (null =
  // a deliberate "since the beginning" choice, not converted to today). Can be
  // removed with "Clear".
  const [startDate, setStartDate] = useState<string | null>(
    initial === undefined ? todayDate() : initial.start_date ?? null
  );
  const [endDate, setEndDate] = useState<string | null>(initial?.end_date ?? null);
  const [goalId, setGoalId] = useState<string | null>(initial?.goal_id ?? null);
  // Contribution style for the linked goal: 'per_completion' (default, +1 per
  // day) or 'amount' (that day's amount × a multiplier). Only meaningful for
  // numeric/timer (a binary habit has no concept of "amount").
  const [goalContribution, setGoalContribution] = useState<GoalContribution>(
    initial?.goal_contribution ?? 'per_completion'
  );
  // Instead of a multiplier, the user is ASKED "how many {habit unit} make one
  // {goal unit}?" — thinking in whole numbers instead of decimals feels
  // natural (e.g. "4 cups make 1 liter"). This is the mathematical INVERSE of
  // goal_factor (liter/cup), so the initial value is also shown inverted.
  // Default "1": if the units are already the same (e.g. page=page), the user
  // gets the right result without touching anything.
  const [goalRatioText, setGoalRatioText] = useState(
    initial?.goal_factor && initial.goal_factor > 0 ? String(1 / initial.goal_factor) : '1'
  );
  const [goals, setGoals] = useState<Goal[]>([]);
  // Which date picker is open: start or end (null = closed).
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

  // Can only link to numeric (progress-counter) goals.
  useEffect(() => {
    setGoals(goalRepo.listByUser(userId).filter((g) => g.goal_type === 'numeric'));
  }, [userId]);

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  // Wizard steps: 'kind' is the very first step only when the type isn't fixed
  // (creation). 'tracking' only enters the list if it has something to show
  // (numeric/timer HAS a target field, or there's at least one goal to link
  // to); if the type hasn't been picked yet (kind is null), this step doesn't
  // exist yet either — it kicks in once the type is chosen, if needed.
  const needsKindStep = stepped && fixedKind == null;
  const hasTrackingStep = kind != null && (kind !== 'binary' || goals.length > 0);
  const steps: WizardStep[] = stepped
    ? [
        ...(needsKindStep ? (['kind'] as const) : []),
        'identity',
        'schedule',
        ...(hasTrackingStep ? (['tracking'] as const) : []),
        'reminder',
      ]
    : [];
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep: WizardStep | null = stepped ? steps[Math.min(stepIndex, steps.length - 1)] : null;
  // Should a field group be shown? Always true while the wizard is off
  // (editing) — all fields appear at once as before, order/behavior unchanged.
  // 'kind' is the EXCEPTION: the tracking type is only picked in the creation
  // wizard (while needsKindStep applies). During editing, kind is always fixed
  // (fixedKind) and the type can never change afterward — it would leave
  // fields inconsistent (e.g. turning a timer whose target is already stored
  // in minutes into a binary habit). So this section never shows during
  // editing (stepped=false).
  const show = (s: WizardStep) => (s === 'kind' ? stepped === true && currentStep === s : !stepped || currentStep === s);

  // A numeric/timer habit can't proceed without entering a target — otherwise
  // target_amount/unit would stay null, producing a meaningless "numeric"
  // habit indistinguishable from a binary one. For numeric, unit is also
  // required (to show what the target actually is); for timer, the unit is
  // always minutes, so it isn't asked for.
  const trackingTargetValid = (() => {
    if (kind !== 'numeric' && kind !== 'timer') return true;
    const parsed = parseFloat(targetText.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return false;
    return kind !== 'numeric' || unit.trim().length > 0;
  })();

  const canProceed =
    (currentStep !== 'kind' || kind != null) &&
    (currentStep !== 'identity' || title.trim().length > 0) &&
    (currentStep !== 'tracking' || trackingTargetValid);
  const isLastStep = !stepped || stepIndex >= steps.length - 1;

  const goNext = () => {
    if (!isLastStep) setStepIndex((i) => i + 1);
    else submit();
  };
  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const submit = () => {
    if (!kind) return; // can't submit without a type chosen (canProceed already blocks this in the wizard)
    const t = title.trim();
    if (!t) return;
    // In editing mode (stepped=false) the wizard's canProceed guard isn't
    // active — the save button calls straight here, so the same rule is
    // enforced here too (see trackingTargetValid).
    if (!trackingTargetValid) return;
    // Pure conversions live in lib/habitFormLogic.ts (so they're testable).
    const schedule = buildSchedule({
      freqMode,
      weekdays,
      everyNText,
      quotaText,
      startDate,
      previousSchedule: initSchedule,
    });
    const { target_amount, unit: unitVal } = buildTarget(kind, targetText, unit);
    const end_date = clampEndDate(startDate, endDate);
    // Contribution style is only meaningful for a numeric/timer habit linked to
    // a goal; otherwise NULL (= per_completion) is sent.
    const goal_contribution: GoalContribution | null =
      goalId && kind !== 'binary' ? goalContribution : null;
    const goal_factor = ratioToGoalFactor(goalRatioText);
    onSubmit({
      title: t,
      kind,
      remind_times: remindTimes,
      icon,
      color,
      schedule,
      target_amount,
      unit: unitVal,
      start_date: startDate,
      end_date,
      goal_id: goalId,
      goal_contribution,
      goal_factor,
    });
  };

  const onPickDate = (picked: Date) => {
    const ymd = toYmd(picked);
    if (datePicker === 'start') setStartDate(ymd);
    else if (datePicker === 'end') setEndDate(ymd);
  };

  // The two labels used in the "how many {unit} make one {goal unit}?"
  // question. For timer, the unit is always minutes (the target is entered in
  // minutes); for numeric, it's whatever unit the user typed, falling back to
  // a generic word when empty.
  const habitUnitLabel = kind === 'timer' ? t('habit.minuteUnit') : unit.trim() || t('habit.genericUnit');
  const selectedGoal = goals.find((g) => g.id === goalId);
  const goalUnitLabel = selectedGoal?.unit?.trim() || t('habit.genericUnit');

  // Don't show decimals for whole numbers (same pattern as AmountStepper.fmt).
  const fmtPreviewNum = (n: number) => (n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100));

  // Live preview: raw numbers for the "if you do X per day, Y gets added to
  // the goal" sentence, provided the entered daily target and ratio are both
  // valid. Hidden if even one of them is invalid.
  const parsedDailyTarget = parseFloat(targetText.replace(',', '.'));
  const parsedRatioPreview = parseFloat(goalRatioText.replace(',', '.'));
  const contributionPreview =
    Number.isFinite(parsedDailyTarget) &&
    parsedDailyTarget > 0 &&
    Number.isFinite(parsedRatioPreview) &&
    parsedRatioPreview > 0
      ? { target: parsedDailyTarget, result: parsedDailyTarget / parsedRatioPreview }
      : null;

  // The default habit color when none is selected — used both by the icon
  // grid's "shown in this color when selected" preview and by the wizard's
  // top identity badge.
  const previewColor = color ?? DEFAULT_HABIT_COLOR;

  return (
    <>
      {/* In the wizard (steps other than type selection and identity), a small
          identity badge at the top — reminds which habit is being configured. */}
      {stepped && currentStep !== 'kind' && currentStep !== 'identity' && (
        <View style={styles.previewRow}>
          <View
            style={[
              styles.previewCircle,
              { borderColor: previewColor, backgroundColor: previewColor + '22' },
            ]}
          >
            <HabitIconGlyph id={icon} size={16} color={previewColor} />
          </View>
          <Text style={styles.previewTitle} numberOfLines={1}>
            {title || t('habit.titlePlaceholder')}
          </Text>
        </View>
      )}

      {/* Tracking type — only the wizard's first step (when the type isn't fixed) */}
      {show('kind') && (
        <>
          <Text style={styles.label}>{t('habit.kindLabel')}</Text>
          {KIND_OPTIONS.map((opt) => {
            const sel = kind === opt.kind;
            return (
              <Pressable
                key={opt.kind}
                style={[styles.kindCard, sel && styles.kindCardSel]}
                onPress={() => setKind(opt.kind)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sel }}
              >
                <View style={[styles.kindIconWrap, sel && styles.kindIconWrapSel]}>
                  <Feather name={opt.name} size={20} color={sel ? colors.onAccent : colors.primary} />
                </View>
                <View style={styles.kindBody}>
                  <Text style={styles.kindTitle}>{t(opt.titleKey)}</Text>
                  <Text style={styles.kindDesc}>{t(opt.descKey)}</Text>
                </View>
                {sel && <Feather name="check" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
        </>
      )}

      {/* Title */}
      {show('identity') && (
        <>
          <Text style={styles.sectionHeader}>{t('habit.sectionIdentity')}</Text>
          <Text style={styles.label}>{t('habit.title')}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('habit.titlePlaceholder')}
            placeholderTextColor={colors.faint}
            autoFocus={autoFocusTitle}
            maxLength={TITLE_MAX_LEN}
          />
          <Text style={styles.counter}>
            {title.length}/{TITLE_MAX_LEN}
          </Text>
        </>
      )}

      {/* Icon + color — the line-vector icon is tinted with the selected color;
          tapping the selected one again removes it. */}
      {show('identity') && (
        <HabitAppearancePicker
          icon={icon}
          onIconChange={setIcon}
          color={color}
          onColorChange={setColor}
          previewColor={previewColor}
          colors={colors}
          styles={styles}
          t={t}
        />
      )}

      {/* Frequency — every day / specific days / every X days / X times a week,
          + date range */}
      {show('schedule') && (
        <>
          <Text style={styles.sectionHeader}>{t('habit.sectionSchedule')}</Text>
          <Text style={styles.label}>{t('habit.frequency')}</Text>
          <View style={styles.freqRow}>
            {(
              [
                { mode: 'daily', labelKey: 'habit.everyDay' },
                { mode: 'days', labelKey: 'habit.specificDays' },
                { mode: 'interval', labelKey: 'habit.freqInterval' },
                { mode: 'quota', labelKey: 'habit.freqQuota' },
              ] as { mode: FreqMode; labelKey: string }[]
            ).map(({ mode, labelKey }) => {
              const sel = freqMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.freqBtn, sel && styles.freqBtnSel]}
                  onPress={() => {
                    setFreqMode(mode);
                    // If empty, pre-select today's day as a helpful default.
                    if (mode === 'days' && weekdays.length === 0) setWeekdays([new Date().getDay()]);
                  }}
                >
                  <Text style={[styles.freqBtnText, sel && styles.freqBtnTextSel]}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {freqMode === 'days' && (
            <View style={styles.dayRow}>
              {WEEKDAY_OPTIONS.map(({ labelKey, wd }) => {
                const sel = weekdays.includes(wd);
                return (
                  <Pressable
                    key={wd}
                    style={[styles.dayChip, sel && styles.dayChipSel]}
                    onPress={() => toggleWeekday(wd)}
                  >
                    <Text style={[styles.dayChipText, sel && styles.dayChipTextSel]}>{t(labelKey)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {freqMode === 'interval' && (
            <View style={styles.freqNumRow}>
              <Text style={styles.freqNumLabel}>{t('habit.everyNPrompt')}</Text>
              <TextInput
                style={styles.freqNumInput}
                value={everyNText}
                onChangeText={setEveryNText}
                keyboardType="number-pad"
                maxLength={SHORT_NUMBER_MAX_LEN}
              />
              <Text style={styles.freqNumHint}>{t('habit.everyNHint')}</Text>
            </View>
          )}

          {freqMode === 'quota' && (
            <View style={styles.freqNumRow}>
              <Text style={styles.freqNumLabel}>{t('habit.quotaPrompt')}</Text>
              <TextInput
                style={styles.freqNumInput}
                value={quotaText}
                onChangeText={setQuotaText}
                keyboardType="number-pad"
                maxLength={1}
              />
              <Text style={styles.freqNumHint}>{t('habit.quotaHint')}</Text>
            </View>
          )}

          {/* Date range: before the start / after the end, the habit doesn't
              appear and doesn't affect the streak. Empty = unlimited. */}
          <Text style={styles.label}>{t('habit.startDate')}</Text>
          <View style={styles.row}>
            <Pressable style={styles.dateBtn} onPress={() => setDatePicker('start')}>
              <Text style={styles.dateBtnText}>
                {startDate ? shortDate(startDate, lang) : t('habit.fromStart')}
              </Text>
            </Pressable>
            {startDate && (
              <Pressable style={styles.clearBtn} onPress={() => setStartDate(null)}>
                <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>{t('habit.endDate')}</Text>
          <View style={styles.row}>
            <Pressable style={styles.dateBtn} onPress={() => setDatePicker('end')}>
              <Text style={styles.dateBtnText}>
                {endDate ? shortDate(endDate, lang) : t('habit.noEnd')}
              </Text>
            </Pressable>
            {endDate && (
              <Pressable style={styles.clearBtn} onPress={() => setEndDate(null)}>
                <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
              </Pressable>
            )}
          </View>

          <DatePickerModal
            visible={!!datePicker}
            value={
              (datePicker === 'start' ? startDate : endDate)
                ? new Date(`${datePicker === 'start' ? startDate : endDate}T00:00:00`)
                : new Date()
            }
            // Don't allow picking an end date before the start (there's also a safeguard on submit).
            minimumDate={datePicker === 'end' && startDate ? new Date(`${startDate}T00:00:00`) : undefined}
            onClose={() => setDatePicker(null)}
            onConfirm={(picked) => {
              onPickDate(picked);
              setDatePicker(null);
            }}
          />
        </>
      )}

      {/* Tracking: a target field depending on type (numeric = daily amount +
          unit, timer = duration in minutes; binary has no target field) + linking to a goal. */}
      {show('tracking') && (
        <>
      <Text style={styles.sectionHeader}>{t('habit.sectionTracking')}</Text>
      {kind === 'numeric' && (
        <>
          <Text style={styles.label}>{t('habit.dailyTarget')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.targetInput]}
              value={targetText}
              onChangeText={setTargetText}
              placeholder={t('habit.amountPlaceholder')}
              placeholderTextColor={colors.faint}
              keyboardType="numeric"
              maxLength={SHORT_NUMBER_MAX_LEN}
            />
            <TextInput
              style={[styles.input, styles.targetInput]}
              value={unit}
              onChangeText={setUnit}
              placeholder={t('habit.unitPlaceholder')}
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              maxLength={UNIT_MAX_LEN}
            />
          </View>
          <Text style={styles.hint}>{t('habit.dailyTargetHint')}</Text>
        </>
      )}

      {kind === 'timer' && (
        <>
          <Text style={styles.label}>{t('habit.durationTarget')}</Text>
          <TextInput
            style={styles.input}
            value={targetText}
            onChangeText={setTargetText}
            placeholder={t('habit.durationPlaceholder')}
            placeholderTextColor={colors.faint}
            keyboardType="numeric"
            maxLength={SHORT_NUMBER_MAX_LEN}
          />
          <Text style={styles.hint}>{t('habit.durationHint')}</Text>
        </>
      )}

      {/* Link to a goal — every day you complete this habit, the selected
          goal's progress increases by +1 (−1 when undone). Numeric goals only. */}
      {goals.length > 0 && (
        <>
          <Text style={styles.label}>{t('habit.linkGoal')}</Text>
          <View style={styles.goalRow}>
            <Pressable
              style={[styles.goalChip, goalId === null && styles.goalChipSel]}
              onPress={() => setGoalId(null)}
            >
              <Text style={[styles.goalChipText, goalId === null && styles.goalChipTextSel]}>
                {t('habit.none')}
              </Text>
            </Pressable>
            {goals.map((g) => {
              const sel = goalId === g.id;
              return (
                <Pressable
                  key={g.id}
                  style={[styles.goalChip, sel && styles.goalChipSel]}
                  onPress={() => setGoalId(sel ? null : g.id)}
                >
                  <Text style={[styles.goalChipText, sel && styles.goalChipTextSel]}>
                    🎯 {g.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{t('habit.linkGoalHint')}</Text>
        </>
      )}

      {/* Contribution style — only meaningful when numeric/timer AND linked to
          a goal. A binary habit has no concept of "amount", it's always +1 per day. */}
      {goalId && kind !== 'binary' && (
        <>
          <Text style={styles.label}>{t('habit.goalContribution')}</Text>
          <View style={styles.freqRow}>
            <Pressable
              style={[styles.freqBtn, goalContribution === 'per_completion' && styles.freqBtnSel]}
              onPress={() => setGoalContribution('per_completion')}
            >
              <Text
                style={[
                  styles.freqBtnText,
                  goalContribution === 'per_completion' && styles.freqBtnTextSel,
                ]}
              >
                {t('habit.contribPerCompletion')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.freqBtn, goalContribution === 'amount' && styles.freqBtnSel]}
              onPress={() => setGoalContribution('amount')}
            >
              <Text
                style={[styles.freqBtnText, goalContribution === 'amount' && styles.freqBtnTextSel]}
              >
                {t('habit.contribAmount')}
              </Text>
            </Pressable>
          </View>

          {goalContribution === 'amount' && (
            <>
              <Text style={styles.label}>
                {t('habit.goalRatioQuestion', { habitUnit: habitUnitLabel, goalUnit: goalUnitLabel })}
              </Text>
              <TextInput
                style={[styles.input, styles.targetInput]}
                value={goalRatioText}
                onChangeText={setGoalRatioText}
                placeholder="1"
                placeholderTextColor={colors.faint}
                keyboardType="numeric"
                maxLength={SHORT_NUMBER_MAX_LEN}
              />
              {contributionPreview != null && (
                <Text style={styles.hint}>
                  {t('habit.goalContributionPreview', {
                    target: fmtPreviewNum(contributionPreview.target),
                    habitUnit: habitUnitLabel,
                    result: fmtPreviewNum(contributionPreview.result),
                    goalUnit: goalUnitLabel,
                  })}
                </Text>
              )}
            </>
          )}
        </>
      )}
        </>
      )}
      {/* ↑ closes the 'tracking' step (numeric/timer target + goal link + contribution style) */}

      {/* Reminder times — multiple can be added. Shown here after Tracking to
          keep the same logical order as the wizard's last step (during editing
          all sections flow in the same order in a single scroll). */}
      {show('reminder') && (
        <>
          <Text style={styles.sectionHeader}>{t('habit.sectionReminder')}</Text>
          <ReminderListEditor label={t('habit.reminder')} times={remindTimes} onChange={setRemindTimes} />
        </>
      )}

      {/* Actions: bottom navigation in the wizard (dot indicator + Back/Next),
          Delete + Save as before during editing. */}
      {stepped ? (
        <View style={styles.wizardNav}>
          <View style={styles.dots} accessibilityLabel={t('common.stepOfA11y', { n: stepIndex + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <View key={s} style={[styles.dot, i === stepIndex && styles.dotActive]} />
            ))}
          </View>
          <View style={styles.navBtns}>
            {stepIndex > 0 && (
              <Pressable
                style={styles.navBackBtn}
                onPress={goBack}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Text style={styles.navBackText}>‹</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.saveBtn, styles.navNextBtn, !canProceed && styles.saveBtnDisabled]}
              onPress={goNext}
              disabled={!canProceed}
            >
              <Text style={styles.saveBtnText}>{isLastStep ? submitLabel : t('common.next')}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
          <Pressable
            style={[styles.saveBtn, !trackingTargetValid && styles.saveBtnDisabled]}
            onPress={submit}
            disabled={!trackingTargetValid}
          >
            <Text style={styles.saveBtnText}>{submitLabel}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}
