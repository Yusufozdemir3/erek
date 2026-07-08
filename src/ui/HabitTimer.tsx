// Zamanlayıcı alışkanlığın kart üzerindeki kontrolü.
// Canlı sayaç "m:ss / m:ss" + Başlat/Duraklat düğmesi + (ilerleme varken) Sıfırla.
// Çalışan durum ve tik TimerProvider'dan gelir; hedefe ulaşınca otomatik tamamlanır
// ve ✓ görünür. `editable` yalnızca bugün için true (geçmiş gün salt-okunur).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fmtClock } from '@/lib/helpers';
import { tapLight, tapMedium } from '@/lib/haptics';
import { useTheme } from '@/ui/ThemeProvider';
import { useTimer } from '@/ui/TimerProvider';
import type { Colors } from './theme';

interface Props {
  habitId: string;
  amount: number;      // o gün DB'de biriken saniye (anlık görüntü)
  target: number;      // hedef saniye
  editable?: boolean;  // bugün mü — kontroller yalnız o zaman görünür
}

export function HabitTimer({ habitId, amount, target, editable }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const timer = useTimer();
  const running = timer.isRunning(habitId);
  // Çalışıyorsa canlı değer; değilse DB'deki birikmiş miktar.
  const live = running ? timer.liveSeconds(habitId) ?? amount : amount;
  const reached = target > 0 && live >= target;

  return (
    <View style={styles.row}>
      <Text style={[styles.value, reached && styles.done]}>
        {fmtClock(Math.floor(live))} / {fmtClock(target)}
      </Text>

      {reached ? (
        <Text style={styles.doneCheck}>✓</Text>
      ) : (
        editable && (
          <Pressable
            style={[styles.btn, running && styles.btnOn]}
            onPress={() => {
              if (running) {
                tapLight();
                timer.pause();
              } else {
                tapMedium();
                timer.start(habitId);
              }
            }}
            hitSlop={6}
          >
            <Text style={[styles.btnText, running && styles.btnTextOn]}>
              {running ? '❚❚' : '▶'}
            </Text>
          </Pressable>
        )
      )}

      {editable && !running && live > 0 && (
        <Pressable
          onPress={() => {
            tapLight();
            timer.reset(habitId);
          }}
          hitSlop={6}
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
  });
