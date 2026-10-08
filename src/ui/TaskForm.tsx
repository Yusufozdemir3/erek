// Task form fields, shared by creation (AddSheet) and editing (TaskEditModal),
// like HabitForm. Saving and the modal belong to the caller. Subtasks: a draft
// list at creation (enableSubtaskDraft), the caller's live section when editing (children).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Priority, Recurrence } from '@/db';
import type { Friend } from '@/sync/friends';
import { buildScheduleLabels, extractTime, hmToDate, scheduleLabel, shiftYmd, toHm, todayDate, toYmd } from '@/lib/helpers';
import { parseTask } from '@/lib/quickAdd/parseTask';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { TITLE_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeTaskFormStyles } from '@/ui/taskFormStyles';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_ORDER, shortDate } from '@/ui/theme';
import { reminderLimit } from '@/plus/plusLogic';
import { useFeaturesUnlocked } from '@/plus/plusStore';
import { TagPicker } from '@/ui/tags';
import { TASK_ICON_SET, TaskIconGlyph, resolveTaskIcon } from '@/ui/taskIcons';
import { useVoiceInput } from '@/ui/useVoiceInput';
import { VoiceButton } from '@/ui/VoiceButton';
import { voicePatch } from '@/ui/voiceTaskPatch';
import { RepeatSheet, type RepeatMode } from '@/ui/RepeatSheet';

// The fields taskRepo.create/update take (the time lives in due_date).
export interface TaskFormValues {
  title: string;
  priority: Priority;
  due_date: string | null; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" | null
  end_time: string | null;  // "HH:MM", only with a start time
  recurrence: Recurrence | null; // null = one-time
  remind_times: string[]; // on the due day
  // Creation only: draft subtask titles, written with the task.
  subtasks?: string[];
  // The friend it's shared with (check-off only); never on a recurring task.
  shared_with_id: string | null;
  icon: string | null;
  tag_ids: string[];
}

interface Props {
  initial?: Partial<{ title: string; priority: Priority; due_date: string | null; end_time: string | null; recurrence: Recurrence | null; remind_times: string[]; shared_with_id: string | null; icon: string | null; tag_ids: string[] }>;
  submitLabel: string;                  // "Save" | "Add"
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;                // editing only
  autoFocusTitle?: boolean;
  children?: ReactNode;                 // editing: the subtask section
  // Creation: collect subtask titles, handed up via onSubmit.
  enableSubtaskDraft?: boolean;
  // Empty = no share section.
  shareFriends?: Friend[];
  // Creation only: a mic whose sentence fills the fields it names (lib/quickAdd).
  enableVoice?: boolean;
  // With enableVoice: start listening as soon as the form opens.
  autoStartVoice?: boolean;
}

// Form values before a voice fill, so one tap can undo it.
interface VoiceSnapshot {
  title: string;
  priority: Priority;
  dueDate: string;
  dueTime: string | null;
  endTime: string | null;
  remindTimes: string[];
}

type VoiceField = 'title' | 'priority' | 'date' | 'time' | 'remind';

// The date shortcuts under the date button.
const QUICK_DATES = [
  { days: 0, labelKey: 'date.quickToday' },
  { days: 1, labelKey: 'date.quickTomorrow' },
  { days: 7, labelKey: 'date.quickNextWeek' },
] as const;

export function TaskForm({ initial, submitLabel, onSubmit, onDelete, autoFocusTitle, children, enableSubtaskDraft, shareFriends = [], enableVoice = false, autoStartVoice = false }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeTaskFormStyles(colors);
  const timeLabel = (hm: string | null) => (hm ? hm : t('task.noTime'));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  // Every task has a date (today by default); it can't be cleared.
  const [dueDate, setDueDate] = useState<string>(
    initial?.due_date ? initial.due_date.slice(0, 10) : todayDate()
  );
  const [dueTime, setDueTime] = useState<string | null>(extractTime(initial?.due_date ?? null));
  const [endTime, setEndTime] = useState<string | null>(initial?.end_time ?? null);
  // On the due day, independent of the due time.
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
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
  // Collapsed; the button shows the selected mode.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>(
    initRec?.freq === 'weekly' ? initRec.weekdays ?? [] : []
  );
  // interval: >= 2
  const [everyNText, setEveryNText] = useState(
    initRec?.freq === 'interval' ? String(initRec.every ?? 2) : '2'
  );
  // monthly: 1–31, defaults to the due day
  const [monthDayText, setMonthDayText] = useState(
    initRec?.freq === 'monthly'
      ? String(initRec.monthDay ?? 1)
      : String(Number((initial?.due_date ?? todayDate()).slice(8, 10)))
  );
  // yearly: "MM-DD" list
  const [yearDates, setYearDates] = useState<string[]>(
    initRec?.freq === 'yearly' ? [...(initRec.dates ?? [])].sort() : []
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [draftSubs, setDraftSubs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState('');
  const [sharedWith, setSharedWith] = useState<string | null>(initial?.shared_with_id ?? null);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [iconOpen, setIconOpen] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(initial?.tag_ids ?? []);
  // Recurring tasks can't be shared (the server would drop the share anyway).
  const shareBlocked = repeatMode !== 'none';

  // A voice fill changes only what the sentence names; what was heard and the
  // old values stay until the title is edited by hand.
  const [voiceNote, setVoiceNote] = useState<{
    heard: string;
    truncated: boolean;
    filled: VoiceField[];
    prev: VoiceSnapshot;
  } | null>(null);
  const unlocked = useFeaturesUnlocked();
  const voice = useVoiceInput((heard) => {
    const patch = voicePatch(parseTask(heard, lang, new Date()), { dueDate, remindTimes }, todayDate(), reminderLimit(unlocked));
    const prev: VoiceSnapshot = { title, priority, dueDate, dueTime, endTime, remindTimes };
    const filled: VoiceField[] = [];
    if (patch.title !== undefined) {
      setTitle(patch.title);
      filled.push('title');
    }
    if (patch.priority) {
      setPriority(patch.priority);
      filled.push('priority');
    }
    if (patch.dueDate) {
      setDueDate(patch.dueDate);
      filled.push('date');
    }
    if (patch.dueTime) {
      setDueTime(patch.dueTime);
      if (endTime && endTime <= patch.dueTime) setEndTime(null);
      filled.push('time');
    }
    if (patch.remindTimes) {
      setRemindTimes(patch.remindTimes);
      filled.push('remind');
    }
    setVoiceNote({ heard, truncated: patch.titleTruncated, filled, prev });
  }, enableVoice);
  // One automatic start per opening; the flow's own dialogs handle permissions.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStartVoice && enableVoice && !autoStarted.current) {
      autoStarted.current = true;
      voice.toggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const undoVoice = () => {
    if (!voiceNote) return;
    const p = voiceNote.prev;
    setTitle(p.title);
    setPriority(p.priority);
    setDueDate(p.dueDate);
    setDueTime(p.dueTime);
    setEndTime(p.endTime);
    setRemindTimes(p.remindTimes);
    setVoiceNote(null);
  };
  const voiceMark = (f: VoiceField) => (voiceNote?.filled.includes(f) ? styles.voiceFilled : null);
  // A current share stays listed (removable) even if that friend is gone.
  const shareOptions: { id: string; name: string }[] = shareFriends.map((f) => ({
    id: f.id,
    name: f.displayName ?? t('friends.unknownName'),
  }));
  if (sharedWith && !shareOptions.some((o) => o.id === sharedWith)) {
    shareOptions.push({ id: sharedWith, name: t('friends.unknownName') });
  }

  const addDraftSub = () => {
    const t = newSub.trim();
    if (!t) return;
    setDraftSubs((prev) => [...prev, t]);
    setNewSub('');
  };
  const removeDraftSub = (i: number) => setDraftSubs((prev) => prev.filter((_, idx) => idx !== i));

  const repeatSummary = (): string =>
    repeatMode === 'none'
      ? t('task.repeatNone')
      : scheduleLabel(buildRecurrence(), buildScheduleLabels(t, (md) => shortDate(`2000-${md}`, lang)));

  // A new mode starts from something sensible: weekly from today, yearly from the due date.
  const pickRepeatMode = (mode: RepeatMode) => {
    setRepeatMode(mode);
    if (mode === 'weekly' && weekdays.length === 0) setWeekdays([new Date().getDay()]);
    if (mode === 'yearly' && yearDates.length === 0) setYearDates([dueDate.slice(5, 10)]);
  };

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  // Incomplete inputs fall back instead of dropping the recurrence: weekly
  // without days / interval < 2 → daily; monthly or yearly → the due date's day.
  const buildRecurrence = (): Recurrence | null => {
    if (repeatMode === 'daily') return { freq: 'daily' };
    if (repeatMode === 'weekly') {
      return weekdays.length > 0
        ? { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) }
        : { freq: 'daily' };
    }
    if (repeatMode === 'interval') {
      const n = parseInt(everyNText, 10);
      return Number.isFinite(n) && n >= 2 ? { freq: 'interval', every: n, anchor: dueDate } : { freq: 'daily' };
    }
    if (repeatMode === 'monthly') {
      const d = parseInt(monthDayText, 10);
      return {
        freq: 'monthly',
        monthDay: Number.isFinite(d) && d >= 1 && d <= 31 ? d : Number(dueDate.slice(8, 10)),
      };
    }
    if (repeatMode === 'yearly') {
      return { freq: 'yearly', dates: yearDates.length > 0 ? yearDates : [dueDate.slice(5, 10)] };
    }
    return null;
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    const due_date = dueTime ? `${dueDate}T${dueTime}:00` : dueDate;
    // Only with a start time, and after it.
    const end_time = dueTime && endTime && endTime > dueTime ? endTime : null;
    const recurrence = buildRecurrence();
    onSubmit({
      title: t,
      priority,
      due_date,
      end_time,
      recurrence,
      remind_times: remindTimes,
      subtasks: enableSubtaskDraft ? draftSubs : undefined,
      shared_with_id: recurrence ? null : sharedWith,
      icon,
      tag_ids: tagIds,
    });
  };

  const onPickDate = (picked: Date) => setDueDate(toYmd(picked));
  const onPickTime = (picked: Date) => setDueTime(toHm(picked));
  const onPickEndTime = (picked: Date) => setEndTime(toHm(picked));

  return (
    <>
      <Text style={styles.label}>{t('task.title')}</Text>
      <View style={styles.titleRow}>
        <TextInput
          style={[styles.input, styles.titleInput, voiceMark('title')]}
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            if (voiceNote) setVoiceNote(null); // edited by hand: no more undo
          }}
          placeholder={t('task.titlePlaceholder')}
          placeholderTextColor={colors.faint}
          autoFocus={autoFocusTitle}
          maxLength={TITLE_MAX_LEN}
        />
        {voice.supported && <VoiceButton listening={voice.listening} onPress={voice.toggle} />}
      </View>
      <Text style={styles.counter}>
        {title.length}/{TITLE_MAX_LEN}
      </Text>
      {voice.listening ? (
        <Text style={styles.voiceLive} accessibilityLiveRegion="polite">
          {voice.partial ? `“${voice.partial}”` : t('voice.listening')}
        </Text>
      ) : (
        <>
          {voice.error && <Text style={styles.voiceError}>{voice.error}</Text>}
          {voiceNote && (
            <View style={styles.voiceNote}>
              <View style={{ flex: 1 }}>
                <Text style={styles.voiceHeard} numberOfLines={3}>
                  {t('voice.heard', { text: voiceNote.heard })}
                </Text>
                {voiceNote.truncated && (
                  <Text style={styles.voiceHeard}>{t('voice.titleTruncated', { max: TITLE_MAX_LEN })}</Text>
                )}
              </View>
              <Pressable onPress={undoVoice} hitSlop={8} accessibilityRole="button">
                <Text style={styles.voiceUndo}>{t('voice.undo')}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      {/* Icon and tags share a row: a small square for the icon, the tag chips beside it. */}
      <View style={styles.pairRow}>
        <View>
          <Text style={styles.label}>{t('task.icon')}</Text>
          <Pressable
            style={[styles.iconBtn, (icon && resolveTaskIcon(icon)) || iconOpen ? styles.iconBtnOn : styles.iconBtnEmpty]}
            onPress={() => setIconOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: iconOpen }}
            accessibilityLabel={t('task.iconA11y', {
              name: icon && resolveTaskIcon(icon) ? t(resolveTaskIcon(icon)!.labelKey) : t('task.iconNone'),
            })}
          >
            {icon && resolveTaskIcon(icon) ? (
              <TaskIconGlyph id={icon} size={22} color={colors.primary} />
            ) : (
              <Feather name="plus" size={18} color={colors.faint} />
            )}
          </Pressable>
        </View>
        <View style={styles.pairCol}>
          <Text style={styles.label}>{t('task.tags')}</Text>
          <TagPicker selected={tagIds} onChange={setTagIds} />
        </View>
      </View>
      {iconOpen && (
        <View style={styles.iconGrid}>
          {TASK_ICON_SET.map((entry) => {
            const sel = icon === entry.id;
            return (
              <Pressable
                key={entry.id}
                style={[styles.iconCell, sel && styles.iconCellSel]}
                onPress={() => {
                  setIcon(sel ? null : entry.id);
                  setIconOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={t(entry.labelKey)}
              >
                <TaskIconGlyph id={entry.id} size={20} color={sel ? colors.primary : colors.muted} />
              </Pressable>
            );
          })}
        </View>
      )}

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

      <Text style={styles.label}>{t('task.dueDate')}</Text>
      <View style={styles.row}>
        <Pressable style={[styles.dateBtn, voiceMark('date')]} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{longDateLabel(dueDate, lang, t('date.noDate'))}</Text>
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        {QUICK_DATES.map(({ days, labelKey }) => {
          const target = shiftYmd(todayDate(), days);
          const selected = dueDate === target;
          return (
            <Pressable
              key={labelKey}
              style={[styles.quickChip, selected && styles.dayChipSel]}
              onPress={() => setDueDate(target)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(labelKey)}
            >
              <Text style={[styles.dayChipText, selected && styles.dayChipTextSel]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      <DatePickerModal
        visible={showPicker}
        value={new Date(`${dueDate}T00:00:00`)}
        onClose={() => setShowPicker(false)}
        onConfirm={onPickDate}
      />

      <View style={styles.pairRow}>
        <View style={styles.pairCol}>
          <Text style={styles.label}>{t('task.time')}</Text>
          <View style={styles.row}>
            <Pressable style={[styles.dateBtn, voiceMark('time')]} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.dateBtnText}>{timeLabel(dueTime)}</Text>
            </Pressable>
            {dueTime && (
              <Pressable
                style={styles.clearIcon}
                onPress={() => {
                  setDueTime(null);
                  setEndTime(null);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${t('task.time')}: ${t('common.clear')}`}
              >
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
            )}
          </View>
        </View>
        {dueTime && (
          <View style={styles.pairCol}>
            <Text style={styles.label}>{t('task.end')}</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.dateBtn}
                onPress={() => setShowEndPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`${t('task.end')}: ${timeLabel(endTime)}`}
              >
                <Text style={styles.dateBtnText}>{endTime ?? '—'}</Text>
              </Pressable>
              {endTime && (
                <Pressable
                  style={styles.clearIcon}
                  onPress={() => setEndTime(null)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('task.end')}: ${t('common.clear')}`}
                >
                  <Feather name="x" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
      {dueTime && endTime && endTime <= dueTime && <Text style={styles.hintError}>{t('task.endAfterStart')}</Text>}

      <TimePickerModal
        visible={showTimePicker}
        value={hmToDate(dueTime)}
        onClose={() => setShowTimePicker(false)}
        onConfirm={onPickTime}
      />

      {dueTime && (
        <TimePickerModal
          visible={showEndPicker}
          value={hmToDate(endTime ?? dueTime)}
          onClose={() => setShowEndPicker(false)}
          onConfirm={onPickEndTime}
        />
      )}

      {/* Reminders and repeat share a row; the repeat list and its per-mode
          controls open full width below it. */}
      <View style={styles.pairRow}>
        <View style={styles.pairCol}>
          <ReminderListEditor label={t('task.reminderShort')} times={remindTimes} onChange={setRemindTimes} compact />
        </View>
        <View style={styles.pairCol}>
          <Text style={styles.label}>{t('task.repeat')}</Text>
          <Pressable
            style={styles.repeatBtn}
            onPress={() => setRepeatOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${t('task.repeat')}: ${repeatSummary()}`}
          >
            <Feather name="repeat" size={15} color={repeatMode !== 'none' ? colors.primary : colors.muted} />
            <Text
              style={[styles.repeatBtnText, styles.repeatBtnTextShrink, repeatMode !== 'none' && styles.repeatBtnTextOn]}
              numberOfLines={2}
            >
              {repeatSummary()}
            </Text>
          </Pressable>
        </View>
      </View>
      <RepeatSheet
        visible={repeatOpen}
        onClose={() => setRepeatOpen(false)}
        mode={repeatMode}
        onMode={pickRepeatMode}
        weekdays={weekdays}
        onToggleWeekday={toggleWeekday}
        everyN={everyNText}
        onEveryN={setEveryNText}
        monthDay={monthDayText}
        onMonthDay={setMonthDayText}
        yearDates={yearDates}
        onYearDates={setYearDates}
        dueDate={dueDate}
      />

      {/* The friend sees it in their lists and can only check it off. */}
      {shareOptions.length > 0 && (
        <>
          <Text style={styles.label}>{t('share.taskSection')}</Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {[{ id: null as string | null, name: t('share.nobody') }, ...shareOptions].map((o) => {
              const selected = !shareBlocked && sharedWith === o.id;
              return (
                <Pressable
                  key={o.id ?? 'none'}
                  style={[styles.chip, selected && styles.chipShareSelected, shareBlocked && { opacity: 0.4 }]}
                  onPress={() => setSharedWith(o.id)}
                  disabled={shareBlocked}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: shareBlocked }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                    {o.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {shareBlocked && <Text style={styles.hint}>{t('share.recurringBlocked')}</Text>}
        </>
      )}

      {children}

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

      <View style={styles.actions}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Pressable style={styles.saveBtn} onPress={submit} accessibilityRole="button" accessibilityLabel={submitLabel}>
          <Text style={styles.saveBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}
