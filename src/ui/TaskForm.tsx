// Görev form ALANLARI — hem oluşturma (AddSheet) hem düzenleme (TaskEditModal)
// tarafından paylaşılır (HabitForm ile aynı desen). Alanlar, durum ve doğrulama
// burada; kalıcılık (create/update), alt görev bölümü ve modal/sheet kabuğu
// çağırana aittir. onSubmit son (dönüştürülmüş) değerleri yukarı verir.
// Alt görevler oluşturmada YOK (yalnız sonradan, düzenleme panelinde) — bu
// yüzden düzenleme tarafı alt görev bölümünü `children` olarak geçer.
// Mimari kural: SQL yok — yalnızca çağıran repo yazar.

import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Priority } from '@/db';
import { extractTime, hmToDate, toHm, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { longDateLabel, PRIORITY_COLOR, PRIORITY_ORDER, type Colors } from '@/ui/theme';

// taskRepo.create/update'in beklediği alanlarla örtüşür (due_date saat gömülü).
export interface TaskFormValues {
  title: string;
  priority: Priority;
  due_date: string | null; // "YYYY-MM-DD" | "YYYY-MM-DDTHH:MM:SS" | null
  end_time: string | null;  // "HH:MM" | null — yalnız başlangıç saati varken anlamlı
  // Yalnız oluşturmada (enableSubtaskDraft): görevle birlikte yazılacak alt
  // görev başlıkları. Düzenlemede alt görevler anında yazıldığı için buradan
  // gelmez (undefined).
  subtasks?: string[];
}

interface Props {
  initial?: Partial<{ title: string; priority: Priority; due_date: string | null; end_time: string | null }>;
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
  // Son tarih: OLUŞTURMADA (initial yok) varsayılan olarak BUGÜN gelir — en sık
  // senaryo "bugün yapılacak" ve tarihsiz görev "Bugün" ekranında görünmez.
  // DÜZENLEMEDE ise mevcut değer korunur (null = bilinçli tarihsiz görev, bugüne
  // çevrilmez). İstenmeyen tarih "Temizle" ile kaldırılabilir.
  const [dueDate, setDueDate] = useState<string | null>(
    initial === undefined ? todayDate() : initial.due_date ? initial.due_date.slice(0, 10) : null
  );
  const [dueTime, setDueTime] = useState<string | null>(extractTime(initial?.due_date ?? null));
  const [endTime, setEndTime] = useState<string | null>(initial?.end_time ?? null);
  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
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

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    // Saat yalnızca bir tarih seçiliyken anlamlıdır.
    const due_date = dueDate ? (dueTime ? `${dueDate}T${dueTime}:00` : dueDate) : null;
    // Bitiş saati yalnız bir başlangıç saati varsa ve ondan SONRA ise geçerli.
    const end_time = dueTime && endTime && endTime > dueTime ? endTime : null;
    onSubmit({
      title: t,
      priority,
      due_date,
      end_time,
      subtasks: enableSubtaskDraft ? draftSubs : undefined,
    });
  };

  // Android'de seçici tek seferlik bir dialog; iOS'ta satır içi kalır.
  const onPickDate = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDueDate(toYmd(picked));
  };

  const onPickTime = (_event: unknown, picked?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (picked) setDueTime(toHm(picked));
  };

  const onPickEndTime = (_event: unknown, picked?: Date) => {
    setShowEndPicker(Platform.OS === 'ios');
    if (picked) setEndTime(toHm(picked));
  };

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
      />

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

      {/* Son tarih */}
      <Text style={styles.label}>{t('task.dueDate')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{longDateLabel(dueDate, lang, t('date.noDate'))}</Text>
        </Pressable>
        {dueDate && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setDueDate(null);
              setDueTime(null);
              setEndTime(null);
            }}
          >
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>

      {showPicker && (
        <DateTimePicker
          value={dueDate ? new Date(`${dueDate}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPickDate}
        />
      )}

      {/* Saat — yalnızca bir tarih seçiliyken anlamlı */}
      {dueDate && (
        <>
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

          {showTimePicker && (
            <DateTimePicker
              value={hmToDate(dueTime)}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onPickTime}
            />
          )}

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

              {showEndPicker && (
                <DateTimePicker
                  value={hmToDate(endTime ?? dueTime)}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onPickEndTime}
                />
              )}
            </>
          )}
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
