// Habit form fields, shared by creation (AddSheet) and editing (HabitEditModal).
// Fields, state and validation live here; saving, notifications and the modal
// belong to the caller (onSubmit receives the converted values). Remount with
// `key` for a fresh start.
//
// `stepped` (creation only) shows the fields as a wizard — kind → identity →
// schedule → tracking (if any) → reminder. Without it (editing) everything is
// one scroll, in the same order.

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

// Monday to Sunday (wd = JS getDay).
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

// Exactly the fields habitRepo.create/update take.
export interface HabitFormValues {
  title: string;
  kind: HabitKind;
  remind_times: string[];
  icon: string | null;
  color: string | null;
  schedule: Recurrence | null;
  target_amount: number | null; // numeric: amount · timer: SECONDS · binary: null
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  goal_id: string | null;
  goal_contribution: GoalContribution | null; // with goal_id only; NULL = per_completion
  goal_factor: number;                        // 'amount' mode only
}

interface Props {
  userId: string;                       // whose goals can be linked
  // Fixed when editing (a kind never changes); omitted at creation, where the
  // wizard's first step picks it.
  kind?: HabitKind;
  initial?: Partial<HabitFormValues>;   // editing only
  submitLabel: string;                  // "Save" | "Add"
  onSubmit: (values: HabitFormValues) => void;
  onDelete?: () => void;                // editing only
  autoFocusTitle?: boolean;
  stepped?: boolean;                    // wizard mode (creation only)
}

type WizardStep = 'kind' | 'identity' | 'schedule' | 'tracking' | 'reminder';
type FreqMode = HabitFreqMode;

// The wizard's first step (creation only).
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
  // null = not picked yet (creation).
  const [kind, setKind] = useState<HabitKind | null>(fixedKind ?? initial?.kind ?? null);
  const initWeekly =
    !!initSchedule && initSchedule.freq === 'weekly' && (initSchedule.weekdays?.length ?? 0) > 0;
  // every day / weekdays / every X days / X times a week
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
  // interval: >= 2, otherwise every day.
  const [everyNText, setEveryNText] = useState(
    initSchedule?.freq === 'interval' ? String(initSchedule.every ?? 2) : '2'
  );
  // quota: 1–7 a week.
  const [quotaText, setQuotaText] = useState(
    isQuotaSchedule(initSchedule) ? String(initSchedule!.timesPerWeek) : '3'
  );
  // numeric: amount; timer: MINUTES (stored as seconds).
  const [targetText, setTargetText] = useState(
    initial?.target_amount == null
      ? ''
      : kind === 'timer'
        ? String(initial.target_amount / 60)
        : String(initial.target_amount)
  );
  const [unit, setUnit] = useState(initial?.unit ?? '');
  // Today when creating; when editing, a null start stays null ("from the beginning").
  const [startDate, setStartDate] = useState<string | null>(
    initial === undefined ? todayDate() : initial.start_date ?? null
  );
  const [endDate, setEndDate] = useState<string | null>(initial?.end_date ?? null);
  const [goalId, setGoalId] = useState<string | null>(initial?.goal_id ?? null);
  const [goalContribution, setGoalContribution] = useState<GoalContribution>(
    initial?.goal_contribution ?? 'per_completion'
  );
  // Asked as "how many {habit unit} make one {goal unit}?" (4 cups = 1 liter),
  // the inverse of goal_factor. 1 fits matching units.
  const [goalRatioText, setGoalRatioText] = useState(
    initial?.goal_factor && initial.goal_factor > 0 ? String(1 / initial.goal_factor) : '1'
  );
  const [goals, setGoals] = useState<Goal[]>([]);
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

  // Only numeric goals can be linked.
  useEffect(() => {
    setGoals(goalRepo.listByUser(userId).filter((g) => g.goal_type === 'numeric'));
  }, [userId]);

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  // 'kind' only when the kind isn't fixed; 'tracking' only once a kind is
  // picked and it has something to show (a target or a goal to link).
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
  // Editing shows every group except 'kind' (a kind never changes: a timer's
  // stored seconds wouldn't fit another kind).
  const show = (s: WizardStep) => (s === 'kind' ? stepped === true && currentStep === s : !stepped || currentStep === s);

  // Numeric needs a target and a unit, timer a target (always minutes) —
  // otherwise it would just be a binary habit.
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
    if (!kind) return;
    const t = title.trim();
    if (!t) return;
    // Editing has no wizard guard, so check again.
    if (!trackingTargetValid) return;
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
    // Only a linked numeric/timer habit has a contribution style.
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

  // Units in the "how many … make one …?" question (timer: minutes).
  const habitUnitLabel = kind === 'timer' ? t('habit.minuteUnit') : unit.trim() || t('habit.genericUnit');
  const selectedGoal = goals.find((g) => g.id === goalId);
  const goalUnitLabel = selectedGoal?.unit?.trim() || t('habit.genericUnit');

  const fmtPreviewNum = (n: number) => (n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100));

  // "X a day adds Y to the goal" preview; hidden while either input is invalid.
  const parsedDailyTarget = parseFloat(targetText.replace(',', '.'));
  const parsedRatioPreview = parseFloat(goalRatioText.replace(',', '.'));
  const contributionPreview =
    Number.isFinite(parsedDailyTarget) &&
    parsedDailyTarget > 0 &&
    Number.isFinite(parsedRatioPreview) &&
    parsedRatioPreview > 0
      ? { target: parsedDailyTarget, result: parsedDailyTarget / parsedRatioPreview }
      : null;

  const previewColor = color ?? DEFAULT_HABIT_COLOR;

  return (
    <>
      {/* Later wizard steps: a badge showing which habit this is. */}
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

      {/* Tapping the selected icon/color again clears it. */}
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
                    // Start with today's weekday.
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

          {/* Outside the range the habit is hidden and the streak untouched. */}
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
            minimumDate={datePicker === 'end' && startDate ? new Date(`${startDate}T00:00:00`) : undefined}
            onClose={() => setDatePicker(null)}
            onConfirm={(picked) => {
              onPickDate(picked);
              setDatePicker(null);
            }}
          />
        </>
      )}

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
                    <Feather name="target" size={13} color={sel ? colors.onAccent : colors.muted} /> {g.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{t('habit.linkGoalHint')}</Text>
        </>
      )}

      {/* Contribution style: linked numeric/timer habits only. */}
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
      {show('reminder') && (
        <>
          <Text style={styles.sectionHeader}>{t('habit.sectionReminder')}</Text>
          <ReminderListEditor label={t('habit.reminder')} times={remindTimes} onChange={setRemindTimes} />
        </>
      )}

      {/* Wizard: dots + Back/Next. Editing: Delete + Save. */}
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
