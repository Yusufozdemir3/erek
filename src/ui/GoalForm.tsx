// Hedef form ALANLARI — hem oluşturma (AddSheet) hem düzenleme (app/goal/[id].tsx
// 'Düzenle' sekmesi) tarafından paylaşılır (Habit/TaskForm ile aynı desen). Alanlar, durum ve
// doğrulama burada; kalıcılık (create/update), milestone checklist bölümü ve
// modal/sheet kabuğu çağırana aittir. onSubmit son (dönüştürülmüş) değerleri
// yukarı verir.
//
// goal_type artık iki değer alır: 'numeric' (ilerleme çubuğu) | 'milestone'
// (görev/alt görev mantığıyla aynı — adımlara bölünebilir). Tip yalnız
// OLUŞTURMADA seçilir (goalType prop verilmezse üstte chip ile), düzenlemede
// SABİTTİR (goalType prop verilir) — tip değişimi alanları tutarsız bırakır.
// Deadline artık HER iki tipte de var ve ZORUNLU (bkz. TaskForm'daki son tarih
// kararının aynısı) — varsayılan bugün, kaldırma seçeneği yok.
// Milestone'lar subtasklarla birebir aynı iki-modlu desen: oluşturmada taslak
// (enableMilestoneDraft), düzenlemede anında yazılan checklist (children).
// Mimari kural: SQL yok — yalnızca çağıran repo yazar.

import { useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { GoalType } from '@/db';
import { hmToDate, todayDate, toHm, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { longDateLabel, type Colors } from '@/ui/theme';

export interface GoalFormValues {
  title: string;
  goal_type: GoalType;
  target_value: number | null;
  unit: string | null;
  // Yalnız düzenleme + numeric'te anlamlı; oluşturmada null (repo 0 varsayar).
  current_value: number | null;
  deadline: string;
  remind_at: string | null; // "08:30" günlük giriş hatırlatması; null = yok
  // Yalnız numeric'te anlamlı (tempo/projeksiyon sıfır günü — goalProjection.ts);
  // milestone hedefte null (o tipte tempo hesabı yok).
  start_date: string | null;
  milestones?: string[]; // yalnız enableMilestoneDraft'ta doldurulur
}

interface Props {
  goalType?: GoalType; // sabit verilirse (düzenleme) tip değişmez; verilmezse chip ile seçilir
  initial?: Partial<{
    title: string;
    target_value: number | null;
    unit: string | null;
    current_value: number;
    deadline: string | null;
    remind_at: string | null;
    start_date: string | null;
  }>;
  submitLabel: string;
  onSubmit: (values: GoalFormValues) => void;
  onDelete?: () => void;
  autoFocusTitle?: boolean;
  children?: ReactNode; // düzenlemede milestone checklist (anında yazılır)
  enableMilestoneDraft?: boolean; // oluşturmada taslak milestone editörü
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
  const styles = makeStyles(colors);
  const isEditing = initial !== undefined;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [goalType, setGoalType] = useState<GoalType>(fixedType ?? 'numeric');
  const [target, setTarget] = useState(initial?.target_value != null ? String(initial.target_value) : '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [current, setCurrent] = useState(initial?.current_value != null ? String(initial.current_value) : '');
  // Her hedefte artık zorunlu bir son tarih var — oluşturmada bugün varsayılan
  // (TaskForm'daki due date kararının aynısı), düzenlemede mevcut değer.
  const [deadline, setDeadline] = useState(initial?.deadline ?? todayDate());
  // Günlük giriş hatırlatma saati ("08:30") — HabitForm'daki remind_at deseni.
  const [remindAt, setRemindAt] = useState<string | null>(initial?.remind_at ?? null);
  // Tempo/projeksiyon hesabının sıfır günü (bkz. goalProjection.ts) — yalnız
  // numeric'te anlamlı. Oluşturmada bugün varsayılan (tam da tasarım kararı:
  // "bugün açtığım hedefin ilk günü bugün").
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayDate());
  const [showPicker, setShowPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<string[]>([]);
  const [newMilestone, setNewMilestone] = useState('');

  const addDraftMilestone = () => {
    const m = newMilestone.trim();
    if (!m) return;
    setDraftMilestones((prev) => [...prev, m]);
    setNewMilestone('');
  };
  const removeDraftMilestone = (i: number) =>
    setDraftMilestones((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    const tt = title.trim();
    if (!tt || !deadline) return;
    const numeric = goalType === 'numeric';
    const targetNum = parseFloat(target.replace(',', '.'));
    const currentNum = parseFloat(current.replace(',', '.'));
    onSubmit({
      title: tt,
      goal_type: goalType,
      target_value: numeric && Number.isFinite(targetNum) ? targetNum : null,
      unit: numeric && unit.trim() ? unit.trim() : null,
      current_value: numeric && isEditing && Number.isFinite(currentNum) ? currentNum : null,
      deadline,
      remind_at: remindAt,
      start_date: numeric ? startDate : null,
      milestones: enableMilestoneDraft ? draftMilestones : undefined,
    });
  };

  const onPickDate = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDeadline(toYmd(picked));
  };

  const onPickStartDate = (_event: unknown, picked?: Date) => {
    setShowStartPicker(Platform.OS === 'ios');
    if (picked) setStartDate(toYmd(picked));
  };

  return (
    <>
      {/* Başlık */}
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

      {/* Tip — yalnız oluşturmada seçilir; düzenlemede SABİT (salt gösterim) */}
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
                >
                  <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{t(opt.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Sayısal alanlar */}
      {goalType === 'numeric' && (
        <>
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

          {isEditing && (
            <>
              <Text style={styles.label}>{t('goal.currentValue')}</Text>
              <TextInput
                style={styles.input}
                value={current}
                onChangeText={setCurrent}
                keyboardType="numeric"
                placeholder={t('goal.currentExample')}
                placeholderTextColor={colors.faint}
                maxLength={NUMBER_MAX_LEN}
              />
            </>
          )}

          {/* Tempo/projeksiyon hesabının sıfır günü — "Son 7 gün" ortalaması vb.
              bu tarihten bugüne geçen gerçek gün sayısıyla sınırlanır (bkz.
              goalProjection.ts). Bugünden ileri bir tarih seçilemez. */}
          <Text style={styles.label}>{t('goal.startDateLabel')}</Text>
          <View style={styles.row}>
            <Pressable style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
              <Text style={styles.dateBtnText}>{longDateLabel(startDate, lang, t('date.noDate'))}</Text>
            </Pressable>
          </View>
          {showStartPicker && (
            <DateTimePicker
              value={new Date(`${startDate}T00:00:00`)}
              mode="date"
              maximumDate={new Date(`${todayDate()}T00:00:00`)}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickStartDate}
            />
          )}
        </>
      )}

      {/* Son tarih — artık her iki tipte de zorunlu, kaldırılamaz */}
      <Text style={styles.label}>{t('goal.deadlineLabel')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{longDateLabel(deadline, lang, t('date.noDate'))}</Text>
        </Pressable>
      </View>

      {showPicker && (
        <DateTimePicker
          value={new Date(`${deadline}T00:00:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={onPickDate}
        />
      )}

      {/* Günlük giriş hatırlatması — isteğe bağlı ("şu hedefe giriş yapmayı
          unutma" bildirimi her gün bu saatte gelir; bkz. scheduleGoalReminder). */}
      <Text style={styles.label}>{t('goal.remindLabel')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.dateBtnText}>{remindAt ?? t('habit.noReminder')}</Text>
        </Pressable>
        {remindAt && (
          <Pressable style={styles.clearBtn} onPress={() => setRemindAt(null)}>
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>

      {showTimePicker && (
        <DateTimePicker
          value={hmToDate(remindAt)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e: unknown, picked?: Date) => {
            setShowTimePicker(Platform.OS === 'ios');
            if (picked) setRemindAt(toHm(picked));
          }}
        />
      )}

      {/* Düzenlemede milestone checklist (anında yazılır, parent sağlar) — artık kullanılmıyor:
          adımlar app/goal/[id].tsx'te ayrı bir 'Adımlar' sekmesinde yönetiliyor. */}
      {goalType === 'milestone' && children}

      {/* Oluşturmada taslak milestone editörü (hedef yazılınca birlikte oluşur) */}
      {goalType === 'milestone' && enableMilestoneDraft && (
        <>
          <Text style={styles.label}>{t('goal.milestonesOptional')}</Text>
          {draftMilestones.map((m, i) => (
            <View key={`${m}-${i}`} style={styles.subRow}>
              <View style={styles.subBullet} />
              <Text style={styles.subTitle}>{m}</Text>
              <Pressable onPress={() => removeDraftMilestone(i)} hitSlop={10}>
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
            <Pressable style={styles.subAddBtn} onPress={addDraftMilestone}>
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
    typeTag: {
      alignSelf: 'flex-start',
      fontSize: 12,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 12,
      overflow: 'hidden',
    },
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
    col: { flex: 1 },
    chip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    chipSelected: { backgroundColor: c.primary, borderColor: c.primary },
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

    // — Taslak milestone editörü (oluşturma) —
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
