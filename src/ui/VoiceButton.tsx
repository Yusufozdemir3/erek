// The mic next to a text field. Idle: an outlined mic. Listening: a filled
// button with a stop icon that gently pulses (unless the system's "reduce
// motion" is on) — the user always sees when the mic is open, on top of
// Android's own green privacy dot.

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  listening: boolean;
  onPress: () => void;
  // Overrides the idle accessibility label (default: "fill in by voice").
  label?: string;
}

export function VoiceButton({ listening, onPress, label }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const pulse = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!listening || reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [listening, reduceMotion, pulse]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={listening ? t('voice.stopA11y') : (label ?? t('voice.startA11y'))}
      accessibilityState={{ busy: listening }}
    >
      <Animated.View style={[styles.btn, listening && styles.btnOn, { opacity: pulse }]}>
        <Feather name={listening ? 'square' : 'mic'} size={20} color={listening ? colors.onAccent : colors.primary} />
      </Animated.View>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      width: 48,
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnOn: { backgroundColor: c.primary },
  });
