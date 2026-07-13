// Zamanlayıcı alışkanlığın kart üzerindeki kontrolü.
// Canlı sayaç "m:ss / m:ss" + Başlat/Duraklat düğmesi + (ilerleme varken) Sıfırla.
// Çalışan durum ve tik TimerProvider'dan gelir; hedefe ulaşınca otomatik tamamlanır
// ve ✓ görünür. `editable` yalnızca bugün için true (geçmiş gün salt-okunur).
// Değer metnine dokununca (timer çalışmıyorken) dakika olarak el ile girilebilir —
// AmountStepper'daki "klavyeden gir" desenin aynısı, saniyeye çevrilip onSet'e geçilir.

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
  amount: number;      // o gün DB'de biriken saniye (anlık görüntü)
  target: number;      // hedef saniye
  editable?: boolean;  // bugün mü — kontroller yalnız o zaman görünür
  onSet?: (totalSeconds: number) => void; // klavyeden girilen mutlak süre (saniye)
}

// Saniyeyi dakikaya çevirip tam sayıysa ondalıksız gösterir (AmountStepper.fmt ile aynı desen).
function fmtMinutes(totalSeconds: number): string {
  const mins = totalSeconds / 60;
  return mins % 1 === 0 ? String(mins) : mins.toFixed(1);
}

export function HabitTimer({ habitId, amount, target, editable, onSet }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const timer = useTimer();
  const running = timer.isRunning(habitId);
  // Çalışıyorsa canlı değer; değilse DB'deki birikmiş miktar.
  const live = running ? timer.liveSeconds(habitId) ?? amount : amount;
  const reached = target > 0 && live >= target;

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  // AmountStepper'daki gibi: onBlur + onSubmitEditing aynı oturumda iki kez
  // commit etmesin diye tek seferlik bayrak.
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
            accessibilityRole="button"
            accessibilityLabel={running ? t('habit.timerPauseA11y') : t('habit.timerStartA11y')}
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
