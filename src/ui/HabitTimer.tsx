// A timer habit's card control: live "m:ss / m:ss", start/pause and reset.
// Reaching the target shows ✓ but keeps the controls (it can run on). Only
// today is editable; tapping the value lets the user type minutes.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fmtClock } from '@/lib/helpers';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useTimer } from '@/ui/TimerProvider';
import type { Colors } from './theme';

interface Props {
  habitId: string;
  amount: number;      // seconds stored for that day
  target: number;      // seconds
  editable?: boolean;  // today only
  onSet?: (totalSeconds: number) => void; // a typed total
}

// Seconds as minutes, no trailing decimals.
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
  const live = running ? timer.liveSeconds('habit', habitId) ?? amount : amount;
  const reached = target > 0 && live >= target;

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  // onBlur + onSubmitEditing must commit only once (see AmountStepper).
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
          <Feather name={running ? 'pause' : 'play'} size={14} color={running ? colors.onAccent : colors.primary} />
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
