// Nicel alışkanlıklar için −/＋ miktar sayacı ("5/8 bardak").
// Hem "Bugün" hem "Alışkanlıklar" ekranında kullanılır. Salt görsel + iki eylem;
// değeri değiştirmek çağıran ekranda habitRepo.incrementAmount ile yapılır.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

interface Props {
  amount: number;
  target: number;
  unit: string | null;
  onDec: () => void;
  onInc: () => void;
}

// Tam sayıysa ondalık gösterme (5, 5.5).
function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function AmountStepper({ amount, target, unit, onDec, onInc }: Props) {
  const reached = amount >= target;
  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={onDec} hitSlop={6}>
        <Text style={styles.btnText}>−</Text>
      </Pressable>
      <Text style={[styles.value, reached && styles.valueDone]}>
        {fmt(amount)}/{fmt(target)}
        {unit ? ` ${unit}` : ''}
      </Text>
      <Pressable style={styles.btn} onPress={onInc} hitSlop={6}>
        <Text style={styles.btnText}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 18, lineHeight: 20, fontWeight: '700', color: colors.primary },
  value: { fontSize: 13, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  valueDone: { color: colors.done },
});
