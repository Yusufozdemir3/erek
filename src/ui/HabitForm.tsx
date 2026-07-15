// Alışkanlık form ALANLARI — hem oluşturma (AddSheet) hem düzenleme
// (HabitEditModal) tarafından paylaşılır. Tek kaynak: alanlar, durum ve doğrulama
// burada; kalıcılık (create/update), bildirim programlama ve modal/sheet kabuğu
// çağırana aittir. onSubmit son (dönüştürülmüş) değerleri yukarı verir.
// Parent, hedef/alışkanlık değişince taze başlangıç için `key` ile remount eder.
// Mimari kural: SQL yok — yalnızca goalRepo (okuma, hedef bağlama listesi için).

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { goalRepo } from '@/db';
import type { Goal, GoalContribution, HabitKind, Recurrence } from '@/db';
import { hmToDate, todayDate, toHm, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { HABIT_COLORS, HABIT_ICONS, shortDate, type Colors } from '@/ui/theme';

// Sıklık seçicideki gün düğmeleri (Pazartesi'den Pazar'a; wd = JS getDay).
// Etiketler i18n anahtarı; render'da t() ile çevrilir.
const WEEKDAY_OPTIONS = [
  { labelKey: 'weekday.mon', wd: 1 },
  { labelKey: 'weekday.tue', wd: 2 },
  { labelKey: 'weekday.wed', wd: 3 },
  { labelKey: 'weekday.thu', wd: 4 },
  { labelKey: 'weekday.fri', wd: 5 },
  { labelKey: 'weekday.sat', wd: 6 },
  { labelKey: 'weekday.sun', wd: 0 },
];

// habitRepo.create/update'in beklediği alanlarla birebir örtüşür.
export interface HabitFormValues {
  title: string;
  kind: HabitKind;
  remind_at: string | null;
  icon: string | null;
  color: string | null;
  schedule: Recurrence | null;
  target_amount: number | null; // numeric: miktar · timer: hedef SANİYE · binary: null
  unit: string | null;
  start_date: string | null;
  end_date: string | null;
  goal_id: string | null;
  goal_contribution: GoalContribution | null; // yalnız goal_id varsa anlamlı; NULL = per_completion
  goal_factor: number;                        // yalnız 'amount' modunda anlamlı
}

interface Props {
  userId: string;                       // hedef bağlama listesi bu kullanıcıdan
  kind: HabitKind;                      // takip tipi (oluşturmada sihirbaz seçer; düzenlemede sabit)
  initial?: Partial<HabitFormValues>;   // düzenleme: mevcut değerler; oluşturma: yok (varsayılan)
  submitLabel: string;                  // "Kaydet" | "Ekle"
  onSubmit: (values: HabitFormValues) => void;
  onDelete?: () => void;                // yalnız düzenlemede: Sil düğmesi
  autoFocusTitle?: boolean;             // oluşturmada klavye hemen açılsın
}

export function HabitForm({ userId, kind, initial, submitLabel, onSubmit, onDelete, autoFocusTitle }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  // "08:30" -> okunaklı etiket; null ise "Hatırlatma yok".
  const timeLabel = (hm: string | null) => (hm ? hm : t('habit.noReminder'));
  const initSchedule = initial?.schedule ?? null;
  const initWeekly =
    !!initSchedule && initSchedule.freq === 'weekly' && (initSchedule.weekdays?.length ?? 0) > 0;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [remindAt, setRemindAt] = useState<string | null>(initial?.remind_at ?? null);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [everyDay, setEveryDay] = useState(!initWeekly);
  const [weekdays, setWeekdays] = useState<number[]>(initWeekly ? initSchedule!.weekdays! : []);
  // Nicel: miktar (ör. 8). Zamanlayıcı: hedef DAKİKA (saniyeye çevrilir). Metin olarak tutulur.
  const [targetText, setTargetText] = useState(
    initial?.target_amount == null
      ? ''
      : kind === 'timer'
        ? String(initial.target_amount / 60)
        : String(initial.target_amount)
  );
  const [unit, setUnit] = useState(initial?.unit ?? '');
  // OLUŞTURMADA (initial yok) varsayılan olarak BUGÜN gelir — en sık senaryo
  // "bugünden itibaren" takip etmek. DÜZENLEMEDE mevcut değer korunur (null =
  // bilinçli "baştan beri" tercihi, bugüne çevrilmez). "Temizle" ile kaldırılabilir.
  const [startDate, setStartDate] = useState<string | null>(
    initial === undefined ? todayDate() : initial.start_date ?? null
  );
  const [endDate, setEndDate] = useState<string | null>(initial?.end_date ?? null);
  const [goalId, setGoalId] = useState<string | null>(initial?.goal_id ?? null);
  // Bağlı hedefe katkı biçimi: 'per_completion' (varsayılan, gün başına +1) ya da
  // 'amount' (o gün yapılan miktar × çarpan). Yalnızca nicel/zamanlayıcıda anlamlı
  // (ikili alışkanlıkta "miktar" kavramı yoktur).
  const [goalContribution, setGoalContribution] = useState<GoalContribution>(
    initial?.goal_contribution ?? 'per_completion'
  );
  // Kullanıcıya çarpan yerine "kaç {alışkanlık birimi} bir {hedef birimi} eder?"
  // diye SORULUR — ondalık yerine tam sayıyla düşünmesi doğal (ör. "4 bardak 1
  // litre eder"). goal_factor'ün (litre/bardak) matematiksel TERSİdir; bu yüzden
  // başlangıç değeri de tersine çevrilerek gösterilir. Varsayılan "1": birimler
  // zaten aynıysa (ör. sayfa=sayfa) kullanıcı hiç dokunmadan doğru sonucu görür.
  const [goalRatioText, setGoalRatioText] = useState(
    initial?.goal_factor && initial.goal_factor > 0 ? String(1 / initial.goal_factor) : '1'
  );
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  // Hangi tarih seçici açık: başlangıç mı bitiş mi (null = kapalı).
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

  // Yalnızca sayısal (ilerleme sayacı olan) hedeflere bağlanılabilir.
  useEffect(() => {
    setGoals(goalRepo.listByUser(userId).filter((g) => g.goal_type === 'numeric'));
  }, [userId]);

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    // "Belirli günler" seçili ama hiç gün yoksa "her gün" (null) kabul edilir.
    const schedule: Recurrence | null =
      everyDay || weekdays.length === 0
        ? null
        : { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
    // Hedef/birim tipe göre: numeric = miktar+birim, timer = dakika→saniye,
    // binary = ikisi de null.
    const parsed = parseFloat(targetText.replace(',', '.'));
    let target_amount: number | null = null;
    let unitVal: string | null = null;
    if (kind === 'numeric') {
      target_amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      unitVal = target_amount != null && unit.trim() ? unit.trim() : null;
    } else if (kind === 'timer') {
      // Dakika girilir, saniye saklanır (habit_logs.amount de saniye birikir).
      target_amount = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 60) : null;
    }
    // Bitiş başlangıçtan önce olamaz; olduysa başlangıca çekilir (tek günlük aralık).
    const end_date = endDate && startDate && endDate < startDate ? startDate : endDate;
    // Katkı biçimi yalnız bir hedefe bağlı nicel/zamanlayıcı alışkanlıkta anlamlı;
    // aksi halde NULL (= per_completion) gönderilir.
    const goal_contribution: GoalContribution | null =
      goalId && kind !== 'binary' ? goalContribution : null;
    // Kullanıcı "kaç {birim} bir {hedef birimi} eder" oranını girer (ör. 4);
    // DB'de saklanan goal_factor bunun tersidir (0.25 — hedefe eklenecek gerçek çarpan).
    const parsedRatio = parseFloat(goalRatioText.replace(',', '.'));
    const goal_factor = Number.isFinite(parsedRatio) && parsedRatio > 0 ? 1 / parsedRatio : 1;
    onSubmit({
      title: t,
      kind,
      remind_at: remindAt,
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

  // Android'de seçici tek seferlik bir dialog; iOS'ta satır içi kalır.
  const onPickTime = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setRemindAt(toHm(picked));
  };

  const onPickDate = (_event: unknown, picked?: Date) => {
    const which = datePicker;
    setDatePicker(Platform.OS === 'ios' ? which : null);
    if (picked && which) {
      const ymd = toYmd(picked);
      if (which === 'start') setStartDate(ymd);
      else setEndDate(ymd);
    }
  };

  // "Kaç {birim} bir {hedef birimi} eder?" sorusunda kullanılan iki etiket.
  // Zamanlayıcıda birim hep dakikadır (hedef dakika girilir); nicelde kullanıcının
  // yazdığı birim, boşsa jenerik bir kelimeye düşer.
  const habitUnitLabel = kind === 'timer' ? t('habit.minuteUnit') : unit.trim() || t('habit.genericUnit');
  const selectedGoal = goals.find((g) => g.id === goalId);
  const goalUnitLabel = selectedGoal?.unit?.trim() || t('habit.genericUnit');

  // Tam sayıysa ondalık gösterme (AmountStepper.fmt ile aynı desen).
  const fmtPreviewNum = (n: number) => (n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100));

  // Canlı önizleme: girilen günlük hedef ve oran geçerliyse "günde X yaparsan
  // hedefe Y eklenir" cümlesi için ham sayılar. Biri bile geçersizse gösterilmez.
  const parsedDailyTarget = parseFloat(targetText.replace(',', '.'));
  const parsedRatioPreview = parseFloat(goalRatioText.replace(',', '.'));
  const contributionPreview =
    Number.isFinite(parsedDailyTarget) &&
    parsedDailyTarget > 0 &&
    Number.isFinite(parsedRatioPreview) &&
    parsedRatioPreview > 0
      ? { target: parsedDailyTarget, result: parsedDailyTarget / parsedRatioPreview }
      : null;

  return (
    <>
      {/* Başlık */}
      <Text style={styles.label}>{t('habit.title')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('habit.titlePlaceholder')}
        placeholderTextColor={colors.faint}
        autoFocus={autoFocusTitle}
      />

      {/* Hatırlatma saati */}
      <Text style={styles.label}>{t('habit.reminder')}</Text>
      <View style={styles.row}>
        <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateBtnText}>{timeLabel(remindAt)}</Text>
        </Pressable>
        {remindAt && (
          <Pressable style={styles.clearBtn} onPress={() => setRemindAt(null)}>
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>

      {showPicker && (
        <DateTimePicker
          value={hmToDate(remindAt)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPickTime}
        />
      )}

      {/* İkon (emoji) — seçili olana tekrar basınca kaldırılır */}
      <Text style={styles.label}>{t('habit.icon')}</Text>
      <View style={styles.iconGrid}>
        {HABIT_ICONS.map((em) => {
          const sel = icon === em;
          return (
            <Pressable
              key={em}
              style={[styles.iconCell, sel && styles.iconCellSel]}
              onPress={() => setIcon(sel ? null : em)}
            >
              <Text style={styles.iconText}>{em}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Renk — seçili olana tekrar basınca varsayılana döner */}
      <Text style={styles.label}>{t('habit.color')}</Text>
      <View style={styles.colorRow}>
        {HABIT_COLORS.map((c) => {
          const sel = color === c;
          return (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, sel && styles.swatchSel]}
              onPress={() => setColor(sel ? null : c)}
            >
              {sel && <Text style={styles.swatchCheck}>✓</Text>}
            </Pressable>
          );
        })}
      </View>

      {/* Sıklık — her gün ya da haftanın belirli günleri */}
      <Text style={styles.label}>{t('habit.frequency')}</Text>
      <View style={styles.freqRow}>
        <Pressable
          style={[styles.freqBtn, everyDay && styles.freqBtnSel]}
          onPress={() => setEveryDay(true)}
        >
          <Text style={[styles.freqBtnText, everyDay && styles.freqBtnTextSel]}>{t('habit.everyDay')}</Text>
        </Pressable>
        <Pressable
          style={[styles.freqBtn, !everyDay && styles.freqBtnSel]}
          onPress={() => {
            setEveryDay(false);
            // Boşsa yardımcı olsun diye bugünün gününü seçili getir.
            if (weekdays.length === 0) setWeekdays([new Date().getDay()]);
          }}
        >
          <Text style={[styles.freqBtnText, !everyDay && styles.freqBtnTextSel]}>
            {t('habit.specificDays')}
          </Text>
        </Pressable>
      </View>

      {!everyDay && (
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

      {/* Tarih aralığı: başlangıçtan önce / bitişten sonra alışkanlık görünmez,
          streak'i etkilemez. Boş = sınırsız. */}
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
          <Text style={styles.dateBtnText}>{endDate ? shortDate(endDate, lang) : t('habit.noEnd')}</Text>
        </Pressable>
        {endDate && (
          <Pressable style={styles.clearBtn} onPress={() => setEndDate(null)}>
            <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
          </Pressable>
        )}
      </View>

      {datePicker && (
        <DateTimePicker
          value={
            (datePicker === 'start' ? startDate : endDate)
              ? new Date(`${datePicker === 'start' ? startDate : endDate}T00:00:00`)
              : new Date()
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          // Bitiş, başlangıçtan önce seçilemesin (submit'te ayrıca güvence var).
          minimumDate={
            datePicker === 'end' && startDate ? new Date(`${startDate}T00:00:00`) : undefined
          }
          onChange={onPickDate}
        />
      )}

      {/* Tipe göre hedef alanı: numeric = günlük miktar + birim, timer = süre
          (dakika). binary'de hedef alanı yok (yaptım/yapmadım). */}
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
            />
            <TextInput
              style={[styles.input, styles.targetInput]}
              value={unit}
              onChangeText={setUnit}
              placeholder={t('habit.unitPlaceholder')}
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
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
          />
          <Text style={styles.hint}>{t('habit.durationHint')}</Text>
        </>
      )}

      {/* Hedefe bağla — bu alışkanlığı her tamamladığın gün seçili hedefin
          ilerlemesi +1 artar (geri alınca −1). Yalnızca sayısal hedefler. */}
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

      {/* Katkı biçimi — yalnız nicel/zamanlayıcı VE bir hedefe bağlıyken anlamlı.
          İkili alışkanlıkta "miktar" kavramı yok, hep gün başına +1'dir. */}
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
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 8,
      marginTop: 4,
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
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    iconCell: {
      width: 42,
      height: 42,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
      borderWidth: 1,
      borderColor: c.border,
    },
    iconCellSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    iconText: { fontSize: 20 },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    swatch: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchSel: { borderWidth: 3, borderColor: c.text },
    swatchCheck: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    freqRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    freqBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
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
    targetInput: { flex: 1, marginBottom: 0 },
    hint: { fontSize: 12, color: c.faint, marginTop: 4, marginBottom: 12 },
    goalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    goalChip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    goalChipSel: { borderColor: c.primary, backgroundColor: c.primary },
    goalChipText: { fontSize: 13, fontWeight: '600', color: c.muted },
    goalChipTextSel: { color: c.onAccent },
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
  });
