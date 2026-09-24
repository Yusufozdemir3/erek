// The −/＋ amount stepper for numeric habits ("5/8 cups").
// Used on both the "Today" and "Habits" screens. Purely visual + three
// actions; changing the value is done via habitRepo.incrementAmount in the
// calling screen. Tapping the amount text lets you type a number directly on
// the keyboard (instead of incrementing one by one with +/-).

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

interface Props {
  amount: number;
  target: number;
  unit: string | null;
  onDec: () => void;
  onInc: () => void;
  onSet: (value: number) => void; // absolute value entered from the keyboard
  disabled?: boolean; // true: a future day is being viewed, not editable
}

// Don't show decimals for whole numbers (5, 5.5).
function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function AmountStepper({ amount, target, unit, onDec, onInc, onSet, disabled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const reached = amount >= target;

  // When the keyboard closes after onSubmitEditing, onBlur also fires; the two
  // would run commit() twice in the same editing session, and since onSet
  // applies the absolute value as "current DB value + diff" (habitRepo.incrementAmount
  // works relatively), the second call would mistakenly add the value on top
  // again. The ref ensures only the first commit in a session goes through.
  const committedRef = useRef(false);

  const startEdit = () => {
    if (disabled) return;
    committedRef.current = false;
    setText(fmt(amount));
    setEditing(true);
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const parsed = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(parsed)) onSet(Math.max(0, parsed));
  };

  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Pressable
        style={styles.btn}
        onPress={onDec}
        hitSlop={6}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('habit.decreaseA11y')}
      >
        <Text style={styles.btnText}>−</Text>
      </Pressable>
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
        <Pressable onPress={startEdit} disabled={disabled} hitSlop={6}>
          <Text style={[styles.value, reached && styles.valueDone]}>
            {fmt(amount)}/{fmt(target)}
            {unit ? ` ${unit}` : ''}
          </Text>
        </Pressable>
      )}
      <Pressable
        style={styles.btn}
        onPress={onInc}
        hitSlop={6}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('habit.increaseA11y')}
      >
        <Text style={styles.btnText}>＋</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowDisabled: { opacity: 0.4 },
    btn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: { fontSize: 18, lineHeight: 20, fontWeight: '700', color: c.primary },
    value: { fontSize: 13, fontWeight: '700', color: c.muted, textAlign: 'center' },
    valueDone: { color: c.done },
    valueInput: {
      minWidth: 40,
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
      paddingVertical: 2,
      borderBottomWidth: 1,
      borderBottomColor: c.primary,
    },
  });
