// Görev form ALANLARI — hem oluşturma (AddSheet) hem düzenleme (TaskEditModal)
// tarafından paylaşılır (HabitForm ile aynı desen). Alanlar, durum ve doğrulama
// burada; kalıcılık (create/update), alt görev bölümü ve modal/sheet kabuğu
// çağırana aittir. onSubmit son (dönüştürülmüş) değerleri yukarı verir.
// Alt görevler oluşturmada YOK (yalnız sonradan, düzenleme panelinde) — bu
// yüzden düzenleme tarafı alt görev bölümünü `children` olarak geçer.
// Mimari kural: SQL yok — yalnızca çağıran repo yazar.

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Priority, Recurrence } from '@/db';
import { extractTime, hmToDate, toHm, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { TimePickerModal } from '@/ui/TimePickerModal';
import { SHORT_NUMBER_MAX_LEN, TITLE_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_ORDER, shortDate, type Colors } from '@/ui/theme';

// Tekrar seçicideki gün düğmeleri (Pazartesi'den Pazar'a; wd = JS getDay).
// HabitForm'daki sıklık seçiciyle aynı desen — tutarlı görünüm.
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

// Tekrar modu: 'none' = tek seferlik (varsayılan), 'daily' = her gün,
// 'weekly' = haftanın belirli günleri, 'interval' = her X günde bir,
// 'monthly' = her ayın belirli günü, 'yearly' = her yıl belirli tarihler.
type RepeatMode = 'none' | 'daily' | 'weekly' | 'interval' | 'monthly' | 'yearly';

// Tekrar seçenekleri — hem açılan listeyi hem kapalıyken özet düğmesinin
// etiketini besler (tek kaynak).
const REPEAT_OPTIONS: { mode: RepeatMode; labelKey: string }[] = [
  { mode: 'none', labelKey: 'task.repeatNone' },
  { mode: 'daily', labelKey: 'habit.everyDay' },
  { mode: 'weekly', labelKey: 'habit.specificDays' },
  { mode: 'interval', labelKey: 'habit.freqInterval' },
  { mode: 'monthly', labelKey: 'task.freqMonthly' },
  { mode: 'yearly', labelKey: 'task.freqYearly' },
];

// taskRepo.create/update'in beklediği alanlarla örtüşür (due_date saat gömülü).
export interface TaskFormValues {
  title: string;
  priority: Priority;
  due_date: string | null; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" | null
  end_time: string | null;  // "HH:MM" | null — yalnız başlangıç saati varken anlamlı
  recurrence: Recurrence | null; // null = tek seferlik; tamamlanınca ileri sarılır
  remind_at: string | null; // "HH:MM" | null — son tarih gününde hatırlatma saati
  // Yalnız oluşturmada (enableSubtaskDraft): görevle birlikte yazılacak alt
  // görev başlıkları. Düzenlemede alt görevler anında yazıldığı için buradan
  // gelmez (undefined).
  subtasks?: string[];
}

interface Props {
  initial?: Partial<{ title: string; priority: Priority; due_date: string | null; end_time: string | null; recurrence: Recurrence | null; remind_at: string | null }>;
  submitLabel: string;                  // "Kaydet" | "Ekle"
  onSubmit: (values: TaskFormValues) => void;
  onDelete?: () => void;                // yalnız düzenlemede: Sil düğmesi
  autoFocusTitle?: boolean;             // oluşturmada klavye hemen açılsın
  children?: ReactNode;                 // düzenlemede alt görev bölümü (eylemlerin üstünde)
  // Oluşturmada taslak alt görev editörü göster. Görev henüz olmadığı için alt
  // görevler string olarak toplanır ve onSubmit ile yukarı verilir (AddSheet
  // görevi yazdıktan sonra bunları oluşturur).
  enableSubtaskDraft?: boolean;
}

export function TaskForm({ initial, submitLabel, onSubmit, onDelete, autoFocusTitle, children, enableSubtaskDraft }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  // "08:30" -> okunaklı etiket; null ise "Saat yok".
  const timeLabel = (hm: string | null) => (hm ? hm : t('task.noTime'));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? 'medium');
  // Son tarih artık ZORUNLU: her görevde bir tarih olmalı. Oluşturmada bugün,
  // düzenlemede mevcut tarih (yoksa yine bugün) varsayılan gelir; kaldırma
  // seçeneği yok (aşağıda "Temizle" düğmesi bilerek kaldırıldı).
  const [dueDate, setDueDate] = useState<string>(
    initial?.due_date ? initial.due_date.slice(0, 10) : todayDate()
  );
  const [dueTime, setDueTime] = useState<string | null>(extractTime(initial?.due_date ?? null));
  const [endTime, setEndTime] = useState<string | null>(initial?.end_time ?? null);
  // Hatırlatma saati — son tarihin GÜNÜNDE bu saatte bildirim (due_date'in kendi
  // saatinden bağımsız; alışkanlık remind_at deseni). null = hatırlatma yok.
  const [remindAt, setRemindAt] = useState<string | null>(initial?.remind_at ?? null);
  // Tekrar: kuraldan başlangıç modunu çıkar.
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
  // Tekrar listesi kapalı başlar; düzenlemede bile seçili kip düğmede yazdığı
  // için kullanıcı açmadan ne olduğunu görür.
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatLabel = t(REPEAT_OPTIONS.find((o) => o.mode === repeatMode)!.labelKey);
  const [weekdays, setWeekdays] = useState<number[]>(
    initRec?.freq === 'weekly' ? initRec.weekdays ?? [] : []
  );
  // interval: kaç günde bir (metin; >=2 geçerli).
  const [everyNText, setEveryNText] = useState(
    initRec?.freq === 'interval' ? String(initRec.every ?? 2) : '2'
  );
  // monthly: ayın günü (1-31; varsayılan seçili son tarihin günü).
  const [monthDayText, setMonthDayText] = useState(
    initRec?.freq === 'monthly'
      ? String(initRec.monthDay ?? 1)
      : String(Number((initial?.due_date ?? todayDate()).slice(8, 10)))
  );
  // yearly: "MM-DD" listesi (yıl bileşeni yok).
  const [yearDates, setYearDates] = useState<string[]>(
    initRec?.freq === 'yearly' ? [...(initRec.dates ?? [])].sort() : []
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showRemindPicker, setShowRemindPicker] = useState(false);
  const [showYearDatePicker, setShowYearDatePicker] = useState(false);
  // Oluşturmada taslak alt görevler (henüz görev yok → string listesi).
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
    // Saat yalnızca bir tarih seçiliyken anlamlıdır; tarih artık her zaman var.
    const due_date = dueTime ? `${dueDate}T${dueTime}:00` : dueDate;
    // Bitiş saati yalnız bir başlangıç saati varsa ve ondan SONRA ise geçerli.
    const end_time = dueTime && endTime && endTime > dueTime ? endTime : null;
    // Tekrar kuralı: 'none' → tek seferlik. Eksik/geçersiz alt girdiler makul
    // bir varsayılana düşer ("tekrar istedi"yi sessizce kaybetmemek için):
    // haftalıkta gün yoksa 'daily', aralıkta sayı <2 ise 'daily', aylıkta gün
    // 1-31 dışındaysa son tarihin günü, yıllıkta tarih yoksa son tarihin günü.
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
      remind_at: remindAt,
      subtasks: enableSubtaskDraft ? draftSubs : undefined,
    });
  };

  const onPickDate = (picked: Date) => setDueDate(toYmd(picked));
  const onPickTime = (picked: Date) => setDueTime(toHm(picked));
  const onPickEndTime = (picked: Date) => setEndTime(toHm(picked));
  const onPickRemind = (picked: Date) => setRemindAt(toHm(picked));

  return (
    <>
      {/* Başlık */}
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

      {/* Öncelik */}
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

      {/* Son tarih — zorunlu, kaldırılamaz */}
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

      {/* Saat — isteğe bağlı */}
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

      {/* Bitiş saati — yalnız bir başlangıç saati seçilmişken anlamlı */}
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

      {/* Hatırlatma — son tarihin GÜNÜNDE seçilen saatte bildirim (son tarihin
          kendi saatinden bağımsız; alışkanlık hatırlatması deseni). Boşsa bildirim
          kurulmaz. Tekrarlayan görevde her tekrarın gününde çalar. */}
      <Text style={styles.label}>{t('task.reminder')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowRemindPicker(true)}>
          <Text style={styles.dateBtnText}>{remindAt ? remindAt : t('task.noReminder')}</Text>
        </Pressable>
        {remindAt && (
          <Pressable style={styles.clearBtn} onPress={() => setRemindAt(null)}>
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>
      <TimePickerModal
        visible={showRemindPicker}
        value={hmToDate(remindAt)}
        onClose={() => setShowRemindPicker(false)}
        onConfirm={onPickRemind}
      />

      {/* Tekrar — tek seferlik (varsayılan) / her gün / belirli günler /
          her X günde bir / her ay / her yıl. Tekrarlayan bir görev tamamlanınca
          bir sonraki tekrar tarihine ileri sarılır (aynı görev; kopya yok).
          Altı seçenek yan yana durunca form kalabalıklaşıyordu: kapalıyken
          yalnız SEÇİLİ kipi gösteren bir düğme var, dokununca liste açılıyor.
          Kip seçilince kendiliğinden kapanır — kipe özel ayrıntı denetimleri
          (gün rozetleri, "kaç günde bir" vb.) zaten aşağıda görünmeye devam eder. */}
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
                  // "Belirli günler" seçilince boşsa yardımcı olsun diye bugünün
                  // gününü seçili getir (HabitForm deseni). Yıllıkta da son tarih
                  // ilk tarih olarak gelir.
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
              const md = toYmd(picked).slice(5, 10); // yıl bileşeni atılır
              setYearDates((prev) => (prev.includes(md) ? prev : [...prev, md].sort()));
            }}
          />
        </>
      )}

      {/* Düzenlemede alt görev bölümü buraya gelir (anında yazılır). */}
      {children}

      {/* Oluşturmada taslak alt görev editörü (görev yazılınca birlikte oluşur) */}
      {enableSubtaskDraft && (
        <>
          <Text style={styles.label}>{t('task.subtasksOptional')}</Text>
          {draftSubs.map((s, i) => (
            <View key={`${s}-${i}`} style={styles.subRow}>
              <View style={styles.subBullet} />
              <Text style={styles.subTitle}>{s}</Text>
              <Pressable onPress={() => removeDraftSub(i)} hitSlop={10}>
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
            <Pressable style={styles.subAddBtn} onPress={addDraftSub}>
              <Text style={styles.subAddText}>＋</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Eylemler — Sil yalnız düzenlemede (onDelete varsa) */}
      <View style={styles.actions}>
        {onDelete && <ConfirmDeleteButton onConfirm={onDelete} />}
        <Pressable style={styles.saveBtn} onPress={submit}>
          <Text style={styles.saveBtnText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: c.muted, marginBottom: 8, marginTop: 4 },
    counter: { fontSize: 11, color: c.faint, textAlign: 'right', marginTop: -8, marginBottom: 12 },
    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    row: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    chip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    chipText: { fontSize: 14, fontWeight: '600', color: c.muted },
    chipTextSelected: { color: c.onAccent },
    dateBtn: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    dateBtnText: { fontSize: 15, color: c.text },
    clearBtn: { paddingVertical: 12, paddingHorizontal: 14 },
    clearBtnText: { fontSize: 14, color: c.muted, fontWeight: '600' },
    hint: { fontSize: 12, color: c.danger, marginTop: -6, marginBottom: 10 },
    // Tekrar seçici (HabitForm sıklık seçicisiyle aynı görünüm). 6 seçenek
    // olduğundan satır sarar; flexBasis üçlü sıraya oturtur.
    // Kapalıyken seçili kipi gösteren özet düğmesi; tekrar varsa vurgu renginde.
    repeatBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
      marginBottom: 12,
    },
    repeatBtnText: { fontSize: 15, fontWeight: '700', color: c.muted },
    repeatBtnTextOn: { color: c.primary },
    repeatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    freqBtn: {
      flexGrow: 1,
      flexBasis: '30%',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    // "Kaç günde bir? / Ayın günü" satırı.
    freqNumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    freqNumLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    freqNumInput: {
      width: 64,
      textAlign: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 10,
      paddingVertical: 8,
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
    },
    freqNumHint: { flex: 1, fontSize: 12, color: c.faint },
    // Yıllık tarihlere seçilen "12 Şub ×" çipleri.
    yearDateChip: { width: undefined, paddingHorizontal: 10, backgroundColor: c.primarySoft, borderColor: c.primary },
    yearDateChipText: { fontSize: 13, fontWeight: '700', color: c.primary },
    freqBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    freqBtnText: { fontSize: 14, fontWeight: '600', color: c.muted },
    freqBtnTextSel: { color: c.primary },
    dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    dayChip: {
      width: 42,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    dayChipSel: { borderColor: c.primary, backgroundColor: c.primary },
    dayChipText: { fontSize: 13, fontWeight: '700', color: c.muted },
    dayChipTextSel: { color: c.onAccent },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },

    // — Taslak alt görev editörü (oluşturma) —
    subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
    subBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.faint },
    subTitle: { flex: 1, fontSize: 14, color: c.text },
    subDelete: { fontSize: 20, color: c.faint, paddingHorizontal: 4 },
    subAddRow: { flexDirection: 'row', gap: 8, marginBottom: 4, alignItems: 'center' },
    subInput: {
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
    subAddBtn: {
      width: 44,
      alignSelf: 'stretch',
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    subAddText: { fontSize: 20, color: c.primary, fontWeight: '600' },
  });
