// A short confetti burst for celebrations (a day fully completed, a streak
// medal earned). Purely decorative: it never intercepts touches and unmounts
// itself a few seconds after each burst. Bump `burstId` to play it again.
// With the phone's "remove animations" setting on, nothing is drawn (the haptic
// tick on completion is the acknowledgement).

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '@/ui/useReduceMotion';

const COLORS = ['#f97316', '#10b981', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6'];
const PIECES = 30;
const VISIBLE_MS = 3200;

function Piece({ index, width, height }: { index: number; width: number; height: number }) {
  const progress = useSharedValue(0);
  const cfg = useMemo(
    () => ({
      x0: Math.random() * width,
      drift: (Math.random() - 0.5) * 140,
      delay: Math.random() * 350,
      duration: 1500 + Math.random() * 900,
      size: 7 + Math.random() * 6,
      spin: (Math.random() - 0.5) * 720,
      color: COLORS[index % COLORS.length],
    }),
    // One random layout per mount (each burst remounts its pieces).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    progress.value = withDelay(
      cfg.delay,
      withTiming(1, { duration: cfg.duration, easing: Easing.out(Easing.quad) })
    );
  }, [progress, cfg]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, (progress.value - 0.7) / 0.3),
    transform: [
      { translateX: cfg.drift * progress.value },
      { translateY: -24 + height * 0.8 * progress.value },
      { rotate: `${cfg.spin * progress.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: cfg.x0,
          top: 0,
          width: cfg.size,
          height: cfg.size * 0.6,
          borderRadius: 1,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ burstId }: { burstId: number }) {
  const { width, height } = useWindowDimensions();
  const [visibleBurst, setVisibleBurst] = useState(0);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (burstId === 0) return;
    setVisibleBurst(burstId);
    const id = setTimeout(() => setVisibleBurst(0), VISIBLE_MS);
    return () => clearTimeout(id);
  }, [burstId]);

  if (visibleBurst === 0 || reduceMotion) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={`${visibleBurst}-${i}`} index={i} width={width} height={height} />
      ))}
    </View>
  );
}
