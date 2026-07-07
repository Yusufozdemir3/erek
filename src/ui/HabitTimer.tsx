// Zamanlayıcı alışkanlığın kart üzerindeki gösterimi.
// AŞAMA A: salt-okunur ilerleme ("0:00 / 20:00"). Hedefe ulaşılınca yeşil.
// AŞAMA B'de buraya Başlat/Duraklat/Bitir kontrolleri + canlı sayaç eklenecek.

import { StyleSheet, Text, View } from 'react-native';
import { fmtClock } from '@/lib/helpers';
import { colors } from './theme';

interface Props {
  amount: number; // o gün biriken saniye
  target: number; // hedef saniye
}

export function HabitTimer({ amount, target }: Props) {
  const reached = target > 0 && amount >= target;
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>⏱️</Text>
      <Text style={[styles.value, reached && styles.done]}>
        {fmtClock(amount)} / {fmtClock(target)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { fontSize: 14 },
  value: { fontSize: 13, fontWeight: '700', color: colors.muted },
  done: { color: colors.done },
});
