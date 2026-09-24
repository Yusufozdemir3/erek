// The on-card control for a timer habit.
// A live counter "m:ss / m:ss" + Start/Pause button + (once there's progress) Reset.
// Running state and ticks come from TimerProvider; once the target is reached
// a ✓ badge appears but the timer does NOT stop — the user can keep running
// past the target.
// `editable` is only true for today (a past day is read-only).
// Tapping the value text (while the timer isn't running) lets you enter
// minutes by hand — the same "type it on the keyboard" pattern as
// AmountStepper, converted to seconds and passed to onSet.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { fmtClock } from '@/lib/helpers';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useTimer } from '@/ui/TimerProvider';
import type { Colors } from './theme';

interface Props {
  habitId: string;
  amount: number;      // seconds accumulated in the DB for that day (a snapshot)
  target: number;      // target in seconds
  editable?: boolean;  // is it today — controls only appear then
  onSet?: (totalSeconds: number) => void; // absolute duration entered from the keyboard (seconds)
}

// Converts seconds to minutes and shows it without decimals if it's a whole number (same pattern as AmountStepper.fmt).
function fmtMinutes(totalSeconds: number): string {
  const mins = totalSeconds / 60;
  return mins % 1 === 0 ? String(mins) : mins.toFixed(1);
}

export function HabitTimer({ habitId, amount, target, editable, onSet }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const timer = useTimer();
  const running = timer.isRunning('habit', habitId);
  // The live value while running; otherwise the accumulated amount in the DB.
  const live = running ? timer.liveSeconds('habit', habitId) ?? amount : amount;
  const reached = target > 0 && live >= target;

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  // Same as AmountStepper: a one-shot flag so onBlur + onSubmitEditing don't commit twice in the same session.
  const committedRef = useRef(false);

  const startEdit = () => {
    if (!editable || running || !onSet) return;
    committedRef.current = false;
    setText(fmtMinutes(amount));
    setEditing(true);
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const parsed = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed) && onSet) onSet(Math.max(0, Math.round(parsed * 60)));
  };

  return (
    <View style={styles.row}>
      {editing ? (
        <TextInput
          style={styles.valueInput}
          value={text}
          onChangeText={setText}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          autoFocus
          selectTextOnFocus
        />
      ) : (
        <Pressable onPress={startEdit} disabled={!editable || running || !onSet} hitSlop={6}>
          <Text style={[styles.value, reached && styles.done]}>
            {fmtClock(Math.floor(live))} / {fmtClock(target)}
          </Text>
        </Pressable>
      )}

      {/* Once the target is reached a ✓ badge appears but the controls don't
          disappear — the user can keep running past the target if they want. */}
      {reached && <Text style={styles.doneCheck}>✓</Text>}
      {editable && (
        <Pressable
          style={[styles.btn, running && styles.btnOn]}
          onPress={() => {
            if (running) {
              tapLight();
              timer.pause();
            } else {
              tapMedium();
              timer.start('habit', habitId);
            }
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={running ? t('habit.timerPauseA11y') : t('habit.timerStartA11y')}
        >
          <Text style={[styles.btnText, running && styles.btnTextOn]}>
            {running ? '❚❚' : '▶'}
          </Text>
        </Pressable>
      )}

      {editable && !running && live > 0 && (
        <Pressable
          onPress={() => {
            tapLight();
            timer.reset('habit', habitId);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('habit.timerResetA11y')}
        >
          <Text style={styles.reset}>↺</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    value: { fontSize: 13, fontWeight: '700', color: c.muted, minWidth: 78, textAlign: 'right' },
    done: { color: c.done },
    doneCheck: { fontSize: 15, fontWeight: '800', color: c.done },
    btn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnOn: { backgroundColor: c.primary },
    btnText: { fontSize: 12, fontWeight: '800', color: c.primary },
    btnTextOn: { color: c.onAccent },
    reset: { fontSize: 16, color: c.faint },
    valueInput: {
      minWidth: 50,
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      textAlign: 'right',
      paddingVertical: 2,
      borderBottomWidth: 1,
      borderBottomColor: c.primary,
    },
  });
