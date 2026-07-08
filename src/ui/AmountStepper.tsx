// Nicel alışkanlıklar için −/＋ miktar sayacı ("5/8 bardak").
// Hem "Bugün" hem "Alışkanlıklar" ekranında kullanılır. Salt görsel + üç eylem;
// değeri değiştirmek çağıran ekranda habitRepo.incrementAmount ile yapılır.
// Miktar metnine dokununca klavyeden doğrudan sayı girilebilir (+/- ile tek tek
// artırmak yerine).

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from './theme';

interface Props {
  amount: number;
  target: number;
  unit: string | null;
  onDec: () => void;
  onInc: () => void;
  onSet: (value: number) => void; // klavyeden girilen mutlak değer
  disabled?: boolean; // true: gelecek bir gün görüntüleniyor, düzenlenemez
}

// Tam sayıysa ondalık gösterme (5, 5.5).
function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function AmountStepper({ amount, target, unit, onDec, onInc, onSet, disabled }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const reached = amount >= target;

  // onSubmitEditing'den sonra klavye kapanınca onBlur da tetiklenir; bu
  // ikisi aynı düzenleme oturumunda commit()'i iki kez çalıştırırdı ve
  // onSet mutlak değeri "şimdiki DB değeri + fark" olarak uyguladığından
  // (habitRepo.incrementAmount göreli çalışır) ikinci çağrı değeri yanlışlıkla
  // tekrar üstüne eklerdi. Ref, bir oturumda yalnızca ilk commit'in geçmesini sağlar.
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
      <Pressable style={styles.btn} onPress={onDec} hitSlop={6} disabled={disabled}>
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
      <Pressable style={styles.btn} onPress={onInc} hitSlop={6} disabled={disabled}>
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
