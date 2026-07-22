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
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GoalType } from '@/db';
import { isTimeUnit, TIME_UNIT, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { longDateLabel, shortDate, type Colors } from '@/ui/theme';

// Oluşturmada eklenen taslak adım. Eskiden düz `string` (yalnız başlık) idi:
// hedef DETAY ekranındaki adım editörü miktar ve son tarih de alabildiği için
// aynı şeyin iki farklı hâli oluşuyordu (kullanıcı geri bildirimi). Alanlar
// goal_milestones'ın kendi sütunlarıyla birebir; amount SANİYE cinsindendir
// (zaman birimli hedefte dakika girilir, burada çevrilir — detay ekranındaki
// addMilestone ile aynı kural).
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
  // Yalnız düzenleme + numeric'te anlamlı; oluşturmada null (repo 0 varsayar).
  current_value: number | null;
  deadline: string;
  remind_times: string[]; // günlük giriş hatırlatma saatleri (0 ya da daha fazla)
  // Yalnız numeric'te anlamlı (tempo/projeksiyon sıfır günü — goalProjection.ts);
  // milestone hedefte null (o tipte tempo hesabı yok).
  start_date: string | null;
  milestones?: DraftMilestone[]; // yalnız enableMilestoneDraft'ta doldurulur
  // Yalnız düzenleme + numeric'te anlamlı: "Mevcut değer" elle değiştirilirse
  // farkı goal_entries'e de yazıp tempo/projeksiyona dahil et mi? Varsayılan
  // false (salt düzeltme — bkz. GoalForm'daki checkbox açıklaması).
  log_manual_change?: boolean;
}

interface Props {
  goalType?: GoalType; // sabit verilirse (düzenleme) tip değişmez; verilmezse chip ile seçilir
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
  // Sayısal hedefte birim türü: 'amount' (serbest birim metni) | 'time' (süre —
  // target/current_value SANİYE saklanır, giriş dakika olarak yapılır; bkz.
  // helpers.TIME_UNIT). Yalnız OLUŞTURMADA seçilir (goalType'ın kendisi gibi) —
  // düzenlemede değiştirmek mevcut current_value'nun birimini kaydırırdı.
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
  // "Mevcut değer"i elle değiştirmek varsayılan olarak salt DÜZELTMEdir (tempo/
  // projeksiyonu etkilemez); kullanıcı geriye dönük gerçek ilerleme giriyorsa
  // bunu işaretleyip farkı girdi geçmişine de yazdırabilir (bkz. dosya sonu handleEditSubmit).
  const [logManualChange, setLogManualChange] = useState(false);
  // Her hedefte artık zorunlu bir son tarih var — oluşturmada bugün varsayılan
  // (TaskForm'daki due date kararının aynısı), düzenlemede mevcut değer.
  const [deadline, setDeadline] = useState(initial?.deadline ?? todayDate());
  // Günlük giriş hatırlatma saatleri — HabitForm'daki çoklu hatırlatma deseni.
  const [remindTimes, setRemindTimes] = useState<string[]>(initial?.remind_times ?? []);
  // Tempo/projeksiyon hesabının sıfır günü (bkz. goalProjection.ts) — yalnız
  // numeric'te anlamlı. Oluşturmada bugün varsayılan (tam da tasarım kararı:
  // "bugün açtığım hedefin ilk günü bugün").
  const [startDate, setStartDate] = useState(initial?.start_date ?? todayDate());
  const [showPicker, setShowPicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<DraftMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState('');
  // Miktar/tarih, detay ekranındaki (app/goal/[id].tsx) kademeli çiplerin
  // aynısı: başlık satırı sade kalsın, ekstralar bir dokunuş uzakta olsun.
  const [newMilestoneAmount, setNewMilestoneAmount] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState<string | null>(null);
  const [showMilestoneAmount, setShowMilestoneAmount] = useState(false);
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);

  const addDraftMilestone = () => {
    const m = newMilestone.trim();
    if (!m) return;
    // Miktar yalnız sayısal hedefte anlamlı (detay ekranındaki addMilestone ile
    // AYNI kural): doluysa adım kendi bağımsız eşiği olur, boşsa checklist maddesi.
    const parsedAmount = parseFloat(newMilestoneAmount.replace(',', '.'));
    const amount =
      goalType === 'numeric' && Number.isFinite(parsedAmount) && parsedAmount > 0
        ? isTime
          ? Math.round(parsedAmount * 60) // dakika girilir, saniye saklanır
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

  // Sayısal hedefte miktar+birim zorunlu — aksi halde target_value/unit null
  // kalıp ilerleme çubuğu hiç anlamlı olmayan, "hedefsiz" bir hedef oluşurdu
  // (HabitForm'daki nicel alışkanlık kuralıyla aynı, bkz. trackingTargetValid).
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
    // Süre modunda dakika olarak girilir, saniyeye çevrilip saklanır (habit
    // timer'daki aynı desen).
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

      {/* Sayısal alanlar */}
      {goalType === 'numeric' && (
        <>
          {/* Birim türü — yalnız oluşturmada seçilir (goalType gibi SABİT olur;
              düzenlemede değiştirmek mevcut current_value'nun birimini kaydırırdı). */}
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
              {/* Varsayılan: bu alan salt DÜZELTMEdir, tempo/projeksiyonu etkilemez
                  (bkz. GoalFormValues.log_manual_change yorumu). İşaretlenirse fark
                  girdi geçmişine de yazılır — geriye dönük gerçek ilerleme girme
                  senaryosu için (ör. birkaç gündür loglanmamış okuma). */}
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

          {/* Tempo/projeksiyon hesabının sıfır günü — "Son 7 gün" ortalaması vb.
              bu tarihten bugüne geçen gerçek gün sayısıyla sınırlanır (bkz.
              goalProjection.ts). Bugünden ileri bir tarih seçilemez. */}
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

      {/* Son tarih — artık her iki tipte de zorunlu, kaldırılamaz */}
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

      {/* Günlük giriş hatırlatmaları — isteğe bağlı, birden fazla eklenebilir
          ("şu hedefe giriş yapmayı unutma" bildirimi bu saatlerde gelir). */}
      <ReminderListEditor label={t('goal.remindLabel')} times={remindTimes} onChange={setRemindTimes} />

      {/* Düzenlemede milestone checklist (anında yazılır, parent sağlar) — artık kullanılmıyor:
          adımlar app/goal/[id].tsx'te ayrı bir 'Adımlar' sekmesinde yönetiliyor. */}
      {goalType === 'milestone' && children}

      {/* Oluşturmada taslak adım editörü (hedef yazılınca birlikte oluşur).
          Detay ekranındaki (app/goal/[id].tsx) adım editörüyle EŞİTLENDİ:
          - artık HER İKİ hedef tipinde de görünür (adımlar ikisinde de geçerli;
            eskiden yalnız 'milestone' tipte açılıyordu, oysa sayısal hedefe de
            sonradan adım eklenebiliyordu — aynı şeyin iki farklı hâliydi),
          - başlık satırı sade, miktar/tarih kademeli çiplerde. */}
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

      {/* Eylemler — Sil yalnız düzenlemede (onDelete varsa) */}
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
    hint: { fontSize: 12, color: c.faint, marginTop: -6, marginBottom: 12 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    checkBox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBoxOn: { backgroundColor: c.primary, borderColor: c.primary },
    checkMark: { color: c.onAccent, fontSize: 12, fontWeight: '800' },
    checkLabel: { flex: 1, fontSize: 13, color: c.text },
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
    saveBtnDisabled: { opacity: 0.4 },
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
    subMeta: { fontSize: 11, fontWeight: '600', color: c.muted },
    subDelete: { fontSize: 20, color: c.faint, paddingHorizontal: 4 },
    // — Kademeli çipler (miktar / tarih) — detay ekranındaki milestoneChip* ile aynı dil.
    subChipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
    subChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    subChipSet: { borderColor: c.primary, backgroundColor: c.primarySoft },
    subChipText: { fontSize: 12, fontWeight: '700', color: c.muted },
    subChipTextSet: { color: c.primary },
    subAmountInput: {
      width: 96,
      textAlign: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 999,
      paddingVertical: 7,
      fontSize: 13,
      color: c.text,
      borderWidth: 1,
      borderColor: c.primary,
    },
    subHint: { fontSize: 11, color: c.faint, marginTop: 8, lineHeight: 15 },
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
