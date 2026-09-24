// Task form FIELDS — shared by both creation (AddSheet) and editing
// (TaskEditModal) (same pattern as HabitForm). Fields, state, and validation
// live here; persistence (create/update), the subtask section, and the
// modal/sheet shell belong to the caller. onSubmit hands the final (converted)
// values up. Subtasks are NOT part of creation (only added later, in the edit
// panel) — that's why the edit side passes the subtask section as `children`.
// Architectural rule: no SQL — only the caller's repo writes.

import { useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Priority, Recurrence } from '@/db';
import { extractTime, hmToDate, toHm, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { SHORT_NUMBER_MAX_LEN, TITLE_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeTaskFormStyles } from '@/ui/taskFormStyles';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_ORDER, shortDate } from '@/ui/theme';

// Day buttons in the recurrence picker (Monday through Sunday; wd = JS getDay).
// Same pattern as HabitForm's frequency picker — consistent look.
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

// Recurrence mode: 'none' = one-time (default), 'daily' = every day,
// 'weekly' = specific days of the week, 'interval' = every X days,
// 'monthly' = a specific day of every month, 'yearly' = specific dates every year.
type RepeatMode = 'none' | 'daily' | 'weekly' | 'interval' | 'monthly' | 'yearly';

// Recurrence options — feeds both the dropdown list and the summary button's
// label while collapsed (single source of truth).
const REPEAT_OPTIONS: { mode: RepeatMode; labelKey: string }[] = [
  { mode: 'none', labelKey: 'task.repeatNone' },
  { mode: 'daily', labelKey: 'habit.everyDay' },
  { mode: 'weekly', labelKey: 'habit.specificDays' },
  { mode: 'interval', labelKey: 'habit.freqInterval' },
  { mode: 'monthly', labelKey: 'task.freqMonthly' },
  { mode: 'yearly', labelKey: 'task.freqYearly' },
];

// Mirrors the fields taskRepo.create/update expect (due_date has the time embedded).
export interface TaskFormValues {
  title: string;
  priority: Priority;
  due_date: string | null; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" | null
  end_time: string | null;  // "HH:MM" | null — only meaningful when a start time is set
  recurrence: Recurrence | null; // null = one-time; advances forward on completion
  remind_times: string[]; // reminder times on the due date's day (0 or more)
  // Creation only (enableSubtaskDraft): subtask titles to be written along with
  // the task. Not populated during editing (undefined), since subtasks are
  // written immediately there.
  subtasks?: string[];
}

interface Props {
  initial?: Partial<{ title: string; priority: Priority; due_date: string | null; end_time: string | null; recurrence: Recurrence | null; remind_times: string[] }>;
  submitLabel: string;                  // "Save" | "Add"
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;                // edit mode only: the Delete button
  autoFocusTitle?: boolean;             // open the keyboard immediately on creation
  children?: ReactNode;                 // the subtask section in edit mode (above the actions)
  // Show the draft subtask editor during creation. Since the task doesn't exist
  // yet, subtasks are collected as strings and handed up via onSubmit (AddSheet
  // creates them after writing the task).
  enableSubtaskDraft?: boolean;
}

export function TaskForm({ initial, submitLabel, onSubmit, onDelete, autoFocusTitle, children, enableSubtaskDraft }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeTaskFormStyles(colors);
  // "08:30" -> readable label; "No time" if null.
  const timeLabel = (hm: string | null) => (hm ? hm : t('task.noTime'));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  // Due date is now REQUIRED: every task must have a date. Defaults to today on
  // creation, or the existing date on editing (today if none); there's no way to
  // remove it (the "Clear" button below was deliberately removed).
  const [dueDate, setDueDate] = useState<string>(
    initial?.due_date ? initial.due_date.slice(0, 10) : todayDate()
  );
  const [dueTime, setDueTime] = useState<string | null>(extractTime(initial?.due_date ?? null));
  const [endTime, setEndTime] = useState<string | null>(initial?.end_time ?? null);
  // Reminder times — notifications at these times ON the due date's day
  // (independent of due_date's own time; same pattern as habit reminders). Empty
  // list = no reminder.
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
  // Recurrence: derive the initial mode from the rule.
  const initRec = initial?.recurrence ?? null;
  const initRepeatMode: RepeatMode = !initRec
    ? 'none'
    : initRec.freq === 'interval'
      ? 'interval'
      : initRec.freq === 'monthly'
        ? 'monthly'
        : initRec.freq === 'yearly'
          ? 'yearly'
          : initRec.freq === 'weekly' && (initRec.weekdays?.length ?? 0) > 0
            ? 'weekly'
            : 'daily';
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(initRepeatMode);
  // The recurrence list starts collapsed; even in edit mode the selected mode is
  // shown on the button, so the user sees it without expanding.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatLabel = t(REPEAT_OPTIONS.find((o) => o.mode === repeatMode)!.labelKey);
  const [weekdays, setWeekdays] = useState<number[]>(
    initRec?.freq === 'weekly' ? initRec.weekdays ?? [] : []
  );
  // interval: every how many days (text; >=2 is valid).
  const [everyNText, setEveryNText] = useState(
    initRec?.freq === 'interval' ? String(initRec.every ?? 2) : '2'
  );
  // monthly: day of the month (1-31; defaults to the selected due date's day).
  const [monthDayText, setMonthDayText] = useState(
    initRec?.freq === 'monthly'
      ? String(initRec.monthDay ?? 1)
      : String(Number((initial?.due_date ?? todayDate()).slice(8, 10)))
  );
  // yearly: a list of "MM-DD" (no year component).
  const [yearDates, setYearDates] = useState<string[]>(
    initRec?.freq === 'yearly' ? [...(initRec.dates ?? [])].sort() : []
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showYearDatePicker, setShowYearDatePicker] = useState(false);
  // Draft subtasks during creation (no task exists yet → a list of strings).
  const [draftSubs, setDraftSubs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState('');

  const addDraftSub = () => {
    const t = newSub.trim();
    if (!t) return;
    setDraftSubs((prev) => [...prev, t]);
    setNewSub('');
  };
  const removeDraftSub = (i: number) => setDraftSubs((prev) => prev.filter((_, idx) => idx !== i));

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    // A time is only meaningful when a date is selected; a date now always exists.
    const due_date = dueTime ? `${dueDate}T${dueTime}:00` : dueDate;
    // The end time is only valid if there's a start time and it's AFTER it.
    const end_time = dueTime && endTime && endTime > dueTime ? endTime : null;
    // Recurrence rule: 'none' → one-time. Missing/invalid sub-inputs fall back to
    // a sensible default (so we don't silently drop "they wanted recurrence"):
    // 'daily' if weekly has no day, 'daily' if the interval count is <2, the due
    // date's day if the monthly day is outside 1-31, the due date's day if yearly has no date.
    let recurrence: Recurrence | null = null;
    if (repeatMode === 'daily') {
      recurrence = { freq: 'daily' };
    } else if (repeatMode === 'weekly') {
      recurrence =
        weekdays.length > 0
          ? { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) }
          : { freq: 'daily' };
    } else if (repeatMode === 'interval') {
      const n = parseInt(everyNText, 10);
      recurrence =
        Number.isFinite(n) && n >= 2
          ? { freq: 'interval', every: n, anchor: dueDate }
          : { freq: 'daily' };
    } else if (repeatMode === 'monthly') {
      const d = parseInt(monthDayText, 10);
      recurrence = {
        freq: 'monthly',
        monthDay: Number.isFinite(d) && d >= 1 && d <= 31 ? d : Number(dueDate.slice(8, 10)),
      };
    } else if (repeatMode === 'yearly') {
      recurrence = {
        freq: 'yearly',
        dates: yearDates.length > 0 ? yearDates : [dueDate.slice(5, 10)],
      };
    }
    onSubmit({
      title: t,
      priority,
      due_date,
      end_time,
      recurrence,
      remind_times: remindTimes,
      subtasks: enableSubtaskDraft ? draftSubs : undefined,
    });
  };

  const onPickDate = (picked: Date) => setDueDate(toYmd(picked));
  const onPickTime = (picked: Date) => setDueTime(toHm(picked));
  const onPickEndTime = (picked: Date) => setEndTime(toHm(picked));

  return (
    <>
      {/* Title */}
      <Text style={styles.label}>{t('task.title')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('task.titlePlaceholder')}
        placeholderTextColor={colors.faint}
        autoFocus={autoFocusTitle}
        maxLength={TITLE_MAX_LEN}
      />
      <Text style={styles.counter}>
        {title.length}/{TITLE_MAX_LEN}
      </Text>

      {/* Priority */}
      <Text style={styles.label}>{t('task.priority')}</Text>
      <View style={styles.row}>
        {PRIORITY_ORDER.map((p) => {
          const selected = p === priority;
          const color = PRIORITY_COLOR[p];
          return (
            <Pressable
              key={p}
              style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {t(`priority.${p}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Due date — required, cannot be removed */}
      <Text style={styles.label}>{t('task.dueDate')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{longDateLabel(dueDate, lang, t('date.noDate'))}</Text>
        </Pressable>
      </View>

      <DatePickerModal
        visible={showPicker}
        value={new Date(`${dueDate}T00:00:00`)}
        onClose={() => setShowPicker(false)}
        onConfirm={onPickDate}
      />

      {/* Time — optional */}
      <Text style={styles.label}>{t('task.timeOptional')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.dateBtnText}>{timeLabel(dueTime)}</Text>
        </Pressable>
        {dueTime && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setDueTime(null);
              setEndTime(null);
            }}
          >
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>

      <TimePickerModal
        visible={showTimePicker}
        value={hmToDate(dueTime)}
        onClose={() => setShowTimePicker(false)}
        onConfirm={onPickTime}
      />

      {/* End time — only meaningful once a start time is selected */}
      {dueTime && (
        <>
          <Text style={styles.label}>{t('task.endTime')}</Text>
          <View style={styles.row}>
            <Pressable style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
              <Text style={styles.dateBtnText}>{timeLabel(endTime)}</Text>
            </Pressable>
            {endTime && (
              <Pressable style={styles.clearBtn} onPress={() => setEndTime(null)}>
                <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
              </Pressable>
            )}
          </View>
          {endTime && endTime <= dueTime && (
            <Text style={styles.hint}>{t('task.endAfterStart')}</Text>
          )}

          <TimePickerModal
            visible={showEndPicker}
            value={hmToDate(endTime ?? dueTime)}
            onClose={() => setShowEndPicker(false)}
            onConfirm={onPickEndTime}
          />
        </>
      )}

      {/* Reminder — notifications at the selected times ON the due date's day
          (independent of the due date's own time; same pattern as habit
          reminders). If empty, no notification is scheduled. For a recurring
          task, it fires on the day of each recurrence. */}
      <ReminderListEditor label={t('task.reminder')} times={remindTimes} onChange={setRemindTimes} />

      {/* Recurrence — one-time (default) / every day / specific days / every X
          days / every month / every year. When a recurring task is completed,
          it advances to the next recurrence date (same task; no duplicate).
          Six options side by side made the form feel cluttered: while
          collapsed there's a single button showing only the SELECTED mode,
          tapping it opens the list. It auto-collapses once a mode is picked —
          the mode-specific detail controls (day chips, "every how many days,"
          etc.) keep showing below regardless. */}
      <Text style={styles.label}>{t('task.repeat')}</Text>
      <Pressable
        style={styles.repeatBtn}
        onPress={() => setRepeatOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: repeatOpen }}
        accessibilityLabel={`${t('task.repeat')}: ${repeatLabel}`}
      >
        <Text style={[styles.repeatBtnText, repeatMode !== 'none' && styles.repeatBtnTextOn]}>
          {repeatLabel}
        </Text>
        <Feather
          name={repeatOpen ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={repeatMode !== 'none' ? colors.primary : colors.muted}
        />
      </Pressable>
      {repeatOpen && (
        <View style={styles.repeatRow}>
          {REPEAT_OPTIONS.map(({ mode, labelKey }) => {
            const sel = repeatMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.freqBtn, sel && styles.freqBtnSel]}
                onPress={() => {
                  setRepeatMode(mode);
                  // When "specific days" is picked and it's empty, preselect
                  // today's weekday as a helpful default (HabitForm pattern).
                  // For yearly, the due date is likewise preselected as the first date.
                  if (mode === 'weekly' && weekdays.length === 0) setWeekdays([new Date().getDay()]);
                  if (mode === 'yearly' && yearDates.length === 0) setYearDates([dueDate.slice(5, 10)]);
                  setRepeatOpen(false);
                }}
              >
                <Text style={[styles.freqBtnText, sel && styles.freqBtnTextSel]}>{t(labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {repeatMode === 'weekly' && (
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

      {repeatMode === 'interval' && (
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

      {repeatMode === 'monthly' && (
        <View style={styles.freqNumRow}>
          <Text style={styles.freqNumLabel}>{t('task.monthDayPrompt')}</Text>
          <TextInput
            style={styles.freqNumInput}
            value={monthDayText}
            onChangeText={setMonthDayText}
            keyboardType="number-pad"
            maxLength={2}
          />
          <Text style={styles.freqNumHint}>{t('task.monthDayHint')}</Text>
        </View>
      )}

      {repeatMode === 'yearly' && (
        <>
          <View style={styles.dayRow}>
            {yearDates.map((md) => (
              <Pressable
                key={md}
                style={[styles.dayChip, styles.yearDateChip]}
                onPress={() => setYearDates((prev) => prev.filter((x) => x !== md))}
                accessibilityLabel={t('task.removeDateA11y', { date: shortDate(`2000-${md}`, lang) })}
              >
                <Text style={styles.yearDateChipText}>{shortDate(`2000-${md}`, lang)} ×</Text>
              </Pressable>
            ))}
            <Pressable style={styles.dayChip} onPress={() => setShowYearDatePicker(true)}>
              <Text style={styles.dayChipText}>{t('task.addDate')}</Text>
            </Pressable>
          </View>
          <DatePickerModal
            visible={showYearDatePicker}
            value={new Date(`${dueDate}T00:00:00`)}
            onClose={() => setShowYearDatePicker(false)}
            onConfirm={(picked) => {
              const md = toYmd(picked).slice(5, 10); // year component is discarded
              setYearDates((prev) => (prev.includes(md) ? prev : [...prev, md].sort()));
            }}
          />
        </>
      )}

      {/* The subtask section goes here in edit mode (written immediately). */}
      {children}

      {/* Draft subtask editor during creation (created together when the task is written) */}
      {enableSubtaskDraft && (
        <>
          <Text style={styles.label}>{t('task.subtasksOptional')}</Text>
          {draftSubs.map((s, i) => (
            <View key={`${s}-${i}`} style={styles.subRow}>
              <View style={styles.subBullet} />
              <Text style={styles.subTitle}>{s}</Text>
              <Pressable
                onPress={() => removeDraftSub(i)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('task.removeSubtaskA11y', { title: s })}
              >
                <Text style={styles.subDelete}>×</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.subAddRow}>
            <TextInput
              style={styles.subInput}
              value={newSub}
              onChangeText={setNewSub}
              placeholder={t('task.addSubtask')}
              placeholderTextColor={colors.faint}
              onSubmitEditing={addDraftSub}
              blurOnSubmit={false}
              returnKeyType="done"
              maxLength={TITLE_MAX_LEN}
            />
            <Pressable
              style={styles.subAddBtn}
              onPress={addDraftSub}
              accessibilityRole="button"
              accessibilityLabel={t('task.addSubtask')}
            >
              <Text style={styles.subAddText}>＋</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Actions — Delete only in edit mode (when onDelete is provided) */}
      <View style={styles.actions}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Pressable style={styles.saveBtn} onPress={submit} accessibilityRole="button" accessibilityLabel={submitLabel}>
          <Text style={styles.saveBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}
