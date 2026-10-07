// Today's 7-day strip: a window centered on the selected day (3 before, 3
// after) — tapping an edge day re-centers it, and swiping it sideways moves a
// week. The days slide in from the side they come from (not with the phone's
// "remove animations" setting). Far dates use the calendar.

import { useEffect, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { toYmd } from '@/lib/helpers';
import { DATE_LOCALE, type Colors } from '@/ui/theme';
import type { Lang } from '@/i18n/translations';
import type { WeekProgress } from '@/ui/weekProgress';
import { useReduceMotion } from '@/ui/useReduceMotion';

interface Props {
  selectedDate: string;
  today: string;
  lang: Lang;
  colors: Colors;
  // The dot under each day (omitted = none).
  progress?: WeekProgress;
  onSelect: (ymd: string) => void;
}

const WINDOW_RADIUS = 3;
const SWIPE_DISTANCE = 40; // px of drag that counts as a swipe
const SLIDE = 36; // px the days travel while changing

function addDays(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toYmd(d);
}

export function WeekStrip({ selectedDate, today, lang, colors, progress, onSelect }: Props) {
  const styles = makeStyles(colors);
  const locale = DATE_LOCALE[lang];
  const reduceMotion = useReduceMotion();
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  // The PanResponder is created once, so it reads the latest props via a ref.
  const latest = useRef({ selectedDate, onSelect, reduceMotion });
  latest.current = { selectedDate, onSelect, reduceMotion };
  const shownDate = useRef(selectedDate);

  // Any change of the selected day (swipe, tap, "back to today", the calendar):
  // the days arrive from the side the new date lies on.
  useEffect(() => {
    const prev = shownDate.current;
    shownDate.current = selectedDate;
    if (prev === selectedDate || reduceMotion) return;
    const dir = selectedDate > prev ? 1 : -1;
    x.setValue(dir * SLIDE);
    opacity.setValue(0.3);
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [selectedDate, reduceMotion, x, opacity]);

  const pan = useRef(
    PanResponder.create({
      // Mostly horizontal drags only, so a tap or a vertical scroll isn't taken.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        if (!latest.current.reduceMotion) x.setValue(g.dx * 0.4);
      },
      onPanResponderRelease: (_, g) => {
        const { selectedDate: sel, onSelect: select, reduceMotion: reduce } = latest.current;
        if (Math.abs(g.dx) < SWIPE_DISTANCE) {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          return;
        }
        // Swipe left = later days.
        const next = addDays(sel, g.dx < 0 ? 7 : -7);
        if (reduce) {
          select(next);
          return;
        }
        Animated.parallel([
          Animated.timing(x, { toValue: g.dx < 0 ? -SLIDE : SLIDE, duration: 90, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 90, useNativeDriver: true }),
        ]).start(() => select(next));
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;
  const days = Array.from({ length: WINDOW_RADIUS * 2 + 1 }, (_, i) =>
    addDays(selectedDate, i - WINDOW_RADIUS)
  );

  return (
    <Animated.View
      style={[styles.row, { opacity, transform: [{ translateX: x }] }]}
      {...pan.panHandlers}
    >
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
    </Animated.View>
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
