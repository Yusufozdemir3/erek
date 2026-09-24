// Standalone timer picker — opens on a LONG PRESS of the central ＋ button (a
// short tap opens the usual Task·Habit·Goal menu; see AddFab).
// Shows timer-type habits + duration-based numeric goals (see helpers.TIME_UNIT)
// in a single list; tapping a row routes TimerProvider to that target and starts
// it — the SINGLE-active-timer rule is preserved (tapping another row while one
// is running auto-commits the previous one).
// Tapping an already-running row PAUSES it (not restart it — if TimerProvider.start
// is called a second time for the same target, the commit is skipped and the
// session's elapsed time up to that point would be lost; see the TimerProvider comment).

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { goalRepo, habitRepo } from '@/db';
import { fmtClock, isTimeUnit } from '@/lib/helpers';
import { tapLight, tapMedium } from '@/lib/haptics';
import { DEFAULT_HABIT_COLOR, type Colors } from '@/ui/theme';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { ModalCard } from '@/ui/ModalCard';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useTimer } from '@/ui/TimerProvider';
import type { TimerKind } from '@/lib/timerLogic';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Row {
  kind: TimerKind;
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  amount: number; // seconds accumulated so far (from the DB, not live)
  target: number;
}

export function TimerPicker({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const timer = useTimer();

  // Only computed while the sheet is open (no unnecessary DB query while closed).
  const rows = useMemo<Row[]>(() => {
    if (!visible) return [];
    const habitRows: Row[] = habitRepo
      .listByUser(user.id)
      .filter((h) => h.kind === 'timer' && h.target_amount)
      .map((h) => ({
        kind: 'habit' as const,
        id: h.id,
        title: h.title,
        icon: h.icon,
        color: h.color,
        amount: habitRepo.getAmountOn(h.id, new Date().toISOString().slice(0, 10)),
        target: h.target_amount!,
      }));
    const goalRows: Row[] = goalRepo
      .listByUser(user.id)
      .filter((g) => g.goal_type === 'numeric' && isTimeUnit(g.unit) && g.target_value)
      .map((g) => ({
        kind: 'goal' as const,
        id: g.id,
        title: g.title,
        icon: null,
        color: null,
        amount: g.current_value,
        target: g.target_value!,
      }));
    return [...habitRows, ...goalRows];
  }, [visible, user.id]);

  return (
    <ModalCard visible={visible} onClose={onClose}>
      <Text style={styles.heading}>{t('timer.pickerTitle')}</Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('timer.pickerEmpty')}</Text>
      ) : (
        rows.map((r) => {
          const running = timer.isRunning(r.kind, r.id);
          const live = running ? timer.liveSeconds(r.kind, r.id) ?? r.amount : r.amount;
          const color = r.color ?? DEFAULT_HABIT_COLOR;
          return (
            <Pressable
              key={`${r.kind}:${r.id}`}
              style={styles.row}
              onPress={() => {
                if (running) {
                  tapLight();
                  timer.pause();
                } else {
                  tapMedium();
                  timer.start(r.kind, r.id);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={r.title}
            >
              <View style={[styles.iconWrap, { borderColor: color, backgroundColor: color + '22' }]}>
                {r.kind === 'habit' ? (
                  <HabitIconGlyph id={r.icon} size={16} color={color} />
                ) : (
                  <Feather name="target" size={16} color={color} />
                )}
              </View>
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[styles.clock, running && styles.clockOn]}>
                  {fmtClock(Math.floor(live))} / {fmtClock(r.target)}
                </Text>
              </View>
              <View style={[styles.playBtn, running && styles.playBtnOn]}>
                <Text style={[styles.playBtnText, running && styles.playBtnTextOn]}>
                  {running ? '❚❚' : '▶'}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '800', color: c.text, marginBottom: 16, textAlign: 'center' },
    empty: { fontSize: 14, color: c.faint, textAlign: 'center', paddingVertical: 20 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    title: { fontSize: 15, fontWeight: '700', color: c.text },
    clock: { fontSize: 12, color: c.faint, marginTop: 2, fontWeight: '600' },
    clockOn: { color: c.primary },
    playBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playBtnOn: { backgroundColor: c.primary },
    playBtnText: { fontSize: 13, fontWeight: '800', color: c.primary },
    playBtnTextOn: { color: c.onAccent },
  });
