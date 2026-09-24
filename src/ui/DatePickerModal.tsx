// Custom calendar date picker — replaces the native
// @react-native-community/datetimepicker. Month grid + month navigation +
// "Today" shortcut. Tapping a day picks it and closes immediately (no extra
// "OK" step — a single-tap flow). Visually the same centered-card pattern as ModalCard.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { toYmd } from '@/lib/helpers';
import { DATE_LOCALE, type Colors } from '@/ui/theme';
import { ModalCard } from '@/ui/ModalCard';

interface Props {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  title?: string;
}

const WEEKDAY_LETTERS_START_MONDAY = [1, 2, 3, 4, 5, 6, 0]; // JS getDay() order, starting Monday

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// A 6-week (42-day) grid starting from the 1st of the month — including
// overflow days from the previous/next month, so the calendar always stays a full rectangle.
function buildMonthGrid(monthAnchor: Date): Date[] {
  const first = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const firstWeekday = (first.getDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function DatePickerModal({
  visible,
  value,
  onClose,
  onConfirm,
  minimumDate,
  maximumDate,
  title,
}: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));

  // The modal should return to the selected date's month on every open (the value may have changed while closed).
  useEffect(() => {
    if (visible) setMonthAnchor(new Date(value.getFullYear(), value.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const today = startOfDay(new Date());
  const selectedYmd = toYmd(value);
  const min = minimumDate ? startOfDay(minimumDate) : null;
  const max = maximumDate ? startOfDay(maximumDate) : null;

  const monthLabel = monthAnchor.toLocaleDateString(DATE_LOCALE[lang], {
    month: 'long',
    year: 'numeric',
  });

  const weekdayLabels = WEEKDAY_LETTERS_START_MONDAY.map((wd) => {
    const sample = new Date(2024, 0, 7 + wd); // 2024-01-07 is a Sunday; +wd gives that week's day
    return sample.toLocaleDateString(DATE_LOCALE[lang], { weekday: 'narrow' });
  });

  const goMonth = (delta: number) => {
    setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  const canGoToday = (() => {
    const t0 = today;
    if (min && t0 < min) return false;
    if (max && t0 > max) return false;
    return true;
  })();

  const pick = (d: Date) => {
    onConfirm(d);
    onClose();
  };

  if (!visible) return null;

  return (
    <ModalCard visible={visible} onClose={onClose} scroll={false}>
      <Text style={styles.title}>{title ?? t('date.pickTitle')}</Text>

      <View style={styles.nav}>
        <Pressable
          style={styles.navBtn}
          onPress={() => goMonth(-1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('date.prevMonth')}
        >
          <Feather name="chevron-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel}</Text>
        <Pressable
          style={styles.navBtn}
          onPress={() => goMonth(1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('date.nextMonth')}
        >
          <Feather name="chevron-right" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((w, i) => (
          <Text key={i} style={styles.weekdayText}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((d, i) => {
          const ymd = toYmd(d);
          const inMonth = d.getMonth() === monthAnchor.getMonth();
          const isSelected = ymd === selectedYmd;
          const isToday = ymd === toYmd(today);
          const disabled = (min && startOfDay(d) < min) || (max && startOfDay(d) > max);
          return (
            <Pressable
              key={i}
              style={styles.cell}
              disabled={!!disabled}
              onPress={() => pick(d)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: !!disabled }}
            >
              <View
                style={[
                  styles.dayCircle,
                  isSelected && { backgroundColor: colors.primary },
                  !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !inMonth && styles.dayTextOutside,
                    isSelected && { color: colors.onAccent, fontWeight: '700' },
                    disabled && styles.dayTextDisabled,
                  ]}
                >
                  {d.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.todayBtn, !canGoToday && { opacity: 0.4 }]}
          disabled={!canGoToday}
          onPress={() => pick(new Date())}
          accessibilityRole="button"
          accessibilityLabel={t('common.today')}
        >
          <Feather name="calendar" size={15} color={colors.primary} />
          <Text style={styles.todayBtnText}>{t('common.today')}</Text>
        </Pressable>
        <Pressable
          style={styles.cancelBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    title: { fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 14 },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
    },
    monthLabel: { fontSize: 16, fontWeight: '700', color: c.text, textTransform: 'capitalize' },
    weekdayRow: { flexDirection: 'row', marginBottom: 4 },
    weekdayText: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: c.faint,
      textTransform: 'uppercase',
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    dayCircle: {
      width: '78%',
      aspectRatio: 1,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayText: { fontSize: 14, fontWeight: '600', color: c.text },
    dayTextOutside: { color: c.faint, opacity: 0.4, fontWeight: '400' },
    dayTextDisabled: { color: c.faint, opacity: 0.4 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    todayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
    todayBtnText: { fontSize: 14, fontWeight: '700', color: c.primary },
    cancelBtn: { paddingVertical: 8, paddingHorizontal: 4 },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.muted },
  });
