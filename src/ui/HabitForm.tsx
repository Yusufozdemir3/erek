// Alışkanlık form ALANLARI — hem oluşturma (AddSheet) hem düzenleme
// (HabitEditModal) tarafından paylaşılır. Tek kaynak: alanlar, durum ve doğrulama
// burada; kalıcılık (create/update), bildirim programlama ve modal/sheet kabuğu
// çağırana aittir. onSubmit son (dönüştürülmüş) değerleri yukarı verir.
// Parent, hedef/alışkanlık değişince taze başlangıç için `key` ile remount eder.
// Mimari kural: SQL yok — yalnızca goalRepo (okuma, hedef bağlama listesi için).
//
// STEPPED (sihirbaz) MODU: `stepped` true ise (yalnızca oluşturmada, AddSheet)
// alanlar 3-4 adıma bölünüp tek tek gösterilir — Kimlik (başlık+ikon+renk) →
// Sıklık → Takip (varsa) → Hatırlatma. `stepped` false/verilmemişse (düzenleme,
// HabitEditModal) TÜM alanlar eskisi gibi tek uzun kaydırmada gösterilir —
// aynı JSX parçaları, yalnızca görünürlük koşulu değişir; alan SIRASI ya da
// mantığı değişmez, edit akışı davranışsal olarak birebir korunur.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { goalRepo } from '@/db';
import type { Goal, GoalContribution, HabitKind, Recurrence } from '@/db';
import { isQuotaSchedule, todayDate, toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { DatePickerModal } from '@/ui/DatePickerModal';
import { ReminderListEditor } from '@/ui/ReminderListEditor';
import { SHORT_NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { HABIT_ICON_SET, HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DEFAULT_HABIT_COLOR, HABIT_COLORS, shortDate, type Colors } from '@/ui/theme';

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
  remind_times: string[];
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
  // Takip tipi. Verilirse SABİTTİR (düzenleme — tip oluşturmadan sonra değişmez).
  // Verilmezse (oluşturma) sihirbazın ilk adımı ('kind') tipi kullanıcıya seçtirir.
  kind?: HabitKind;
  initial?: Partial<HabitFormValues>;   // düzenleme: mevcut değerler; oluşturma: yok (varsayılan)
  submitLabel: string;                  // "Kaydet" | "Ekle"
  onSubmit: (values: HabitFormValues) => void;
  onDelete?: () => void;                // yalnız düzenlemede: Sil düğmesi
  autoFocusTitle?: boolean;             // oluşturmada klavye hemen açılsın
  stepped?: boolean;                    // sihirbaz modu (yalnız oluşturma — bkz. üst yorum)
}

type WizardStep = 'kind' | 'identity' | 'schedule' | 'tracking' | 'reminder';
// Sıklık kipi (UI durumu; Recurrence'a submit'te çevrilir — bkz. submit).
type FreqMode = 'daily' | 'days' | 'interval' | 'quota';

// Takip tipi seçimi — sihirbazın ilk adımı (yalnız oluşturmada, tip sabit
// verilmemişse). Emoji yerine ikon setiyle aynı çizgi vektör dili (Feather).
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
  const styles = makeStyles(colors);
  const initSchedule = initial?.schedule ?? null;
  // Tip: sabit verilmişse (düzenleme) ondan; yoksa (oluşturma) kullanıcı sihirbazın
  // ilk adımında seçer (null = henüz seçilmedi).
  const [kind, setKind] = useState<HabitKind | null>(fixedKind ?? initial?.kind ?? null);
  const initWeekly =
    !!initSchedule && initSchedule.freq === 'weekly' && (initSchedule.weekdays?.length ?? 0) > 0;
  // Dört sıklık kipi: her gün / haftanın belirli günleri / her X günde bir /
  // haftada X kez (esnek kota — gün seçilmez, haftalık sayı tutturulur).
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
  // interval: kaç günde bir (metin; >=2 geçerli, aksi halde "her gün"e düşer).
  const [everyNText, setEveryNText] = useState(
    initSchedule?.freq === 'interval' ? String(initSchedule.every ?? 2) : '2'
  );
  // quota: haftada kaç kez (1-7).
  const [quotaText, setQuotaText] = useState(
    isQuotaSchedule(initSchedule) ? String(initSchedule!.timesPerWeek) : '3'
  );
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
  // Hangi tarih seçici açık: başlangıç mı bitiş mi (null = kapalı).
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

  // Yalnızca sayısal (ilerleme sayacı olan) hedeflere bağlanılabilir.
  useEffect(() => {
    setGoals(goalRepo.listByUser(userId).filter((g) => g.goal_type === 'numeric'));
  }, [userId]);

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) => (prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]));
  };

  // Sihirbaz adımları: 'kind' yalnızca tip sabit verilmemişse (oluşturma) baştaki
  // ilk adımdır. 'tracking' yalnızca gösterecek bir şeyi varsa listeye girer
  // (nicel/zamanlayıcının hedef alanı VAR ya da en az bir hedefe bağlanılabilir);
  // tip henüz seçilmediyse (kind null) bu adım da henüz yoktur — tip seçilince
  // gerekiyorsa devreye girer.
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
  // Bir alan grubu gösterilsin mi? Sihirbaz kapalıyken (düzenleme) hep true —
  // tüm alanlar eskisi gibi tek seferde görünür, sıra/davranış değişmez.
  // 'kind' İSTİSNA: takip tipi yalnızca oluşturma sihirbazında (needsKindStep
  // varken) seçtirilir. Düzenlemede kind hep sabit verilir (fixedKind) ve tip
  // sonradan değiştirilemez — alanları tutarsız bırakırdı (ör. hedefi zaten
  // dakika olarak saklanmış bir zamanlayıcıyı ikili yapmak). Bu yüzden
  // düzenlemede (stepped=false) bu bölüm hiç gösterilmez.
  const show = (s: WizardStep) => (s === 'kind' ? stepped === true && currentStep === s : !stepped || currentStep === s);

  // Nicel/zamanlayıcı alışkanlıkta hedef girilmeden geçilemez — aksi halde
  // target_amount/unit null kalıp ikili alışkanlıktan farksız, anlamsız bir
  // "nicel" alışkanlık oluşurdu. Nicelde birim de zorunlu (hedefin ne
  // olduğunu göstermek için); zamanlayıcıda birim hep dakika, ayrıca istemez.
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
    if (!kind) return; // tip seçilmeden gönderilemez (sihirbazda canProceed zaten engeller)
    const t = title.trim();
    if (!t) return;
    // Düzenleme modunda (stepped=false) sihirbazın canProceed engeli devrede
    // değil — kaydet butonu doğrudan burayı çağırır, bu yüzden aynı kural
    // burada da uygulanır (bkz. trackingTargetValid).
    if (!trackingTargetValid) return;
    // Sıklık kipini Recurrence'a çevir. Geçersiz/boş girdiler güvenli tarafa,
    // "her gün"e (null) düşer: belirli günlerde hiç gün seçilmemişse, aralıkta
    // sayı <2 ise, kotada sayı 1-7 dışındaysa.
    let schedule: Recurrence | null = null;
    if (freqMode === 'days' && weekdays.length > 0) {
      schedule = { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
    } else if (freqMode === 'interval') {
      const n = parseInt(everyNText, 10);
      if (Number.isFinite(n) && n >= 2) {
        // Çapa (referans günü): düzenlemede mevcut çapa korunur ki planlı günler
        // kaymasın; oluşturmada başlangıç tarihi (yoksa bugün) çapadır.
        const anchor =
          initSchedule?.freq === 'interval' && initSchedule.anchor
            ? initSchedule.anchor
            : startDate ?? todayDate();
        schedule = { freq: 'interval', every: n, anchor };
      }
    } else if (freqMode === 'quota') {
      const n = parseInt(quotaText, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 7) {
        schedule = { freq: 'weekly', timesPerWeek: n };
      }
    }
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

  // Seçili renk yoksa varsayılan alışkanlık rengi — hem ikon ızgarasının
  // "seçiliyken bu renkte görünür" önizlemesi hem de sihirbazın üstteki kimlik
  // rozeti bunu kullanır.
  const previewColor = color ?? DEFAULT_HABIT_COLOR;

  return (
    <>
      {/* Sihirbazda (tip seçimi ve kimlik dışındaki adımlarda) üstte küçük bir
          kimlik rozeti — hangi alışkanlığı ayarladığını hatırlatır. */}
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

      {/* Takip tipi — yalnız sihirbazın ilk adımı (tip sabit verilmemişse) */}
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

      {/* Başlık */}
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

      {/* İkon + renk — çizgi vektör ikon seçili renkle tintlenir; seçili olana
          tekrar basınca kaldırılır. */}
      {show('identity') && (
        <>
          <Text style={styles.label}>{t('habit.icon')}</Text>
          <View style={styles.iconGrid}>
            {HABIT_ICON_SET.map((entry) => {
              const sel = icon === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  style={[
                    styles.iconCell,
                    sel && {
                      borderColor: previewColor,
                      backgroundColor: previewColor + '1f',
                      borderWidth: 2,
                    },
                  ]}
                  onPress={() => setIcon(sel ? null : entry.id)}
                  accessibilityLabel={t(entry.labelKey)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                >
                  <HabitIconGlyph id={entry.id} size={20} color={sel ? previewColor : colors.muted} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>{t('habit.color')}</Text>
          <View style={styles.colorRow}>
            {HABIT_COLORS.map((c, i) => {
              const sel = color === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.swatch, { backgroundColor: c }, sel && styles.swatchSel]}
                  onPress={() => setColor(sel ? null : c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={t('habit.colorOptionA11y', { n: i + 1 })}
                >
                  {sel && <Text style={styles.swatchCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Sıklık — her gün / belirli günler / her X günde bir / haftada X kez,
          + tarih aralığı */}
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
                    // Boşsa yardımcı olsun diye bugünün gününü seçili getir.
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
            // Bitiş, başlangıçtan önce seçilemesin (submit'te ayrıca güvence var).
            minimumDate={datePicker === 'end' && startDate ? new Date(`${startDate}T00:00:00`) : undefined}
            onClose={() => setDatePicker(null)}
            onConfirm={(picked) => {
              onPickDate(picked);
              setDatePicker(null);
            }}
          />
        </>
      )}

      {/* Takip: tipe göre hedef alanı (numeric = günlük miktar + birim, timer =
          süre dakika; binary'de hedef alanı yok) + hedefe bağla. */}
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
      {/* ↑ 'tracking' adımını kapatır (numeric/timer hedef + hedefe bağla + katkı biçimi) */}

      {/* Hatırlatma saatleri — birden fazla eklenebilir. Sihirbazdaki son adımla
          aynı mantıksal sırayı korumak için burada, Takip'ten sonra gösterilir
          (düzenlemede tüm bölümler tek scrollda aynı sırayla akar). */}
      {show('reminder') && (
        <>
          <Text style={styles.sectionHeader}>{t('habit.sectionReminder')}</Text>
          <ReminderListEditor label={t('habit.reminder')} times={remindTimes} onChange={setRemindTimes} />
        </>
      )}

      {/* Eylemler: sihirbazda alt gezinme (nokta göstergesi + Geri/İleri),
          düzenlemede eskisi gibi Sil + Kaydet. */}
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

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // Bölüm başlığı — düzenlemede (stepped=false) tüm alan grupları tek scrollda
    // art arda geldiği için hangi grubun nerede bittiğini/başladığını gösterir
    // (Kimlik/Sıklık/Hedef/Hatırlatma). Sihirbazda (stepped) her adımda tek bir
    // başlık görünür — o adımın bağlamını netleştirir, zarar vermez.
    sectionHeader: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      marginTop: 22,
      marginBottom: 12,
      paddingTop: 18,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 8,
      marginTop: 4,
    },
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
    freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    // "Kaç günde bir? / Haftada kaç kez?" satırı (interval + kota kipleri).
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
    // Çipler İKİŞERLİ sarar (flexBasis ~yarım satır + flexGrow ile satırı doldurur).
    // Eskiden `flex: 1` idi: 4 sıklık çipi tek satıra sıkışıp her biri ¼ genişlik
    // alıyor, "Haftada X kez" iki satıra kırılıp satır yüksekliğini bozuyordu.
    // İki çipli kullanımda (katkı biçimi) görünüm aynı kalır — tek satırda ikisi.
    freqBtn: {
      flexBasis: '47%',
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    freqBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    freqBtnText: { fontSize: 14, fontWeight: '600', color: c.muted, textAlign: 'center' },
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
    saveBtnDisabled: { opacity: 0.4 },

    // Sihirbaz: üstteki kimlik rozeti (kimlik dışındaki adımlarda gösterilir).
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    previewCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    previewTitle: { fontSize: 15, fontWeight: '700', color: c.text, flex: 1 },

    // Sihirbaz: alt gezinme (nokta göstergesi + Geri/İleri).
    wizardNav: { marginTop: 20 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.border },
    dotActive: { backgroundColor: c.primary, width: 18 },
    navBtns: { flexDirection: 'row', gap: 12 },
    navBackBtn: {
      width: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    navBackText: { fontSize: 20, fontWeight: '700', color: c.text },
    navNextBtn: { flex: 1 },

    // Sihirbaz: takip tipi seçim kartları (ilk adım).
    kindCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    kindCardSel: { borderColor: c.primary, backgroundColor: c.primarySoft, borderWidth: 2 },
    kindIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    kindIconWrapSel: { backgroundColor: c.primary },
    kindBody: { flex: 1 },
    kindTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    kindDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
  });
