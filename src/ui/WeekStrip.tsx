// A 7-day strip on the "Today" screen for quick nearby-day navigation without
// opening the calendar modal. It's a SLIDING WINDOW centered on selectedDate
// (3 days before .. 3 days after) — not a scrollable/swipeable list — so there's
// no gesture-handler or reanimated layout animation involved (deliberately kept
// simple after the reanimated layout-animation crash fix). Tapping an edge day
// just re-centers the window on it. The month calendar (DatePickerModal) still
// covers jumping to a far-away date.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toYmd } from '@/lib/helpers';
import { DATE_LOCALE, type Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';
import type { WeekProgress } from '@/ui/weekProgress';

interface Props {
  selectedDate: string;
  today: string;
  lang: Lang;
  colors: Colors;
  // Per-day completion → the dot under each date (omitted = no dots).
  progress?: WeekProgress;
  onSelect: (ymd: string) => void;
}

const WINDOW_RADIUS = 3; // 3 before + selected + 3 after = 7 cells

function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toYmd(d);
}

export function WeekStrip({ selectedDate, today, lang, colors, progress, onSelect }: Props) {
  const styles = makeStyles(colors);
  const locale = DATE_LOCALE[lang];
  const days = Array.from({ length: WINDOW_RADIUS * 2 + 1 }, (_, i) =>
    addDays(selectedDate, i - WINDOW_RADIUS)
  );

  return (
    <View style={styles.row}>
      {days.map((ymd) => {
        const d = new Date(`${ymd}T00:00:00`);
        const isSelected = ymd === selectedDate;
        const isToday = ymd === today;
        const p = progress?.[ymd];
        // all done = filled · some done = ring · nothing done yet = faint dot · empty day = no dot
        const dotStyle =
          !p || p.total === 0
            ? null
            : p.done >= p.total
              ? styles.dotAll
              : p.done > 0
                ? styles.dotSome
                : styles.dotNone;
        return (
          <Pressable
            key={ymd}
            style={styles.cell}
            onPress={() => onSelect(ymd)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[styles.weekday, isSelected && styles.weekdaySelected]}>
              {d.toLocaleDateString(locale, { weekday: 'narrow' })}
            </Text>
            <View
              style={[
                styles.dayCircle,
                isSelected && { backgroundColor: colors.primary },
                !isSelected && isToday && { borderWidth: 1.5, borderColor: colors.primary },
              ]}
            >
              <Text style={[styles.dayText, isSelected && { color: colors.onAccent, fontWeight: '700' }]}>
                {d.getDate()}
              </Text>
            </View>
            <View style={[styles.dot, dotStyle]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    cell: { alignItems: 'center', gap: 4, width: 34 },
    weekday: { fontSize: 11, fontWeight: '600', color: c.faint, textTransform: 'uppercase' },
    weekdaySelected: { color: c.primary },
    dayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotAll: { backgroundColor: c.done },
    dotSome: { borderWidth: 1.5, borderColor: c.done },
    dotNone: { backgroundColor: c.faint, opacity: 0.6 },
    dayText: { fontSize: 14, fontWeight: '600', color: c.text },
  });
