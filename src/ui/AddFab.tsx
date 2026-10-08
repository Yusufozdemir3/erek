// The central ＋ (speed-dial). Tapping rotates the square into an × and the
// Task · Habit · Goal options (and "voice task", where speech works) spring open;
// picking one opens that AddSheet form.
// AddFabButton sits in the tab bar; AddFab, the full-screen overlay, is a
// sibling of Tabs in _layout. Both follow the same `open` state.

import { useEffect, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@/ui/AddSheet';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import { tapMedium } from '@/lib/haptics';
import type { Colors } from '@/ui/theme';

type AddStep = Exclude<Step, 'menu'>;

// Option colors readable in both themes.
// `voice`: the task form opens with the mic already listening.
const OPTIONS: { key: string; step: AddStep; type: EntityType; labelKey: string; color: string; voice?: boolean }[] = [
  { key: 'goal', step: 'goal', type: 'goal', labelKey: 'add.goal', color: '#f59e0b' },
  { key: 'habit', step: 'habit', type: 'habit', labelKey: 'add.habit', color: '#f97316' },
  { key: 'voice', step: 'task', type: 'voice', labelKey: 'add.voiceTask', color: '#0ea5e9', voice: true },
  { key: 'task', step: 'task', type: 'task', labelKey: 'add.task', color: '#6366f1' },
];

// A long press opens the standalone timer picker (TimerPicker) when given.
export function AddFabButton({
  open,
  onPress,
  onLongPress,
}: {
  open: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 90,
    }).start();
  }, [open, anim]);

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  return (
    <Pressable
      style={styles.buttonWrap}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              tapMedium();
              onLongPress();
            }
          : undefined
      }
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={open ? t('add.collapse') : t('add.expand')}
      accessibilityHint={onLongPress ? t('timer.longPressHint') : undefined}
      accessibilityState={{ expanded: open }}
    >
      {/* Two bars, not a glyph: centered regardless of font metrics. */}
      <Animated.View style={[styles.square, { transform: [{ rotate }] }]}>
        <View style={styles.plusBox}>
          <View style={styles.plusBarH} />
          <View style={styles.plusBarV} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

// The option fan's distance above the screen bottom when there is no system bar to add.
const FAN_BOTTOM = 96;

export function AddFab({
  open,
  onClose,
  onPick,
  voiceAvailable,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (step: AddStep, voice?: boolean) => void;
  voiceAvailable: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // The menu fans out above the tab bar, which is taller by the system bar when edge-to-edge.
  const { bottom: bottomInset } = useSafeAreaInsets();
  // One value per option, for the staggered entrance.
  const anims = useRef(OPTIONS.map(() => new Animated.Value(0))).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Stays mounted until the close animation ends.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(backdrop, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      Animated.stagger(
        55,
        anims.map((a) =>
          Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 5, tension: 75 })
        )
      ).start();
    } else {
      Animated.timing(backdrop, { toValue: 0, duration: 130, useNativeDriver: true }).start();
      Animated.stagger(
        25,
        [...anims].reverse().map((a) =>
          Animated.timing(a, { toValue: 0, duration: 120, useNativeDriver: true })
        )
      ).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, anims, backdrop]);

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.backdrop, { opacity: backdrop }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={[styles.fan, { bottom: FAN_BOTTOM + bottomInset }]} pointerEvents="box-none">
        {OPTIONS.map((opt, i) => {
          if (opt.voice && !voiceAvailable) return null;
          const a = anims[i];
          // Rises with a slight swing.
          const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [56, 0] });
          const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
          const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] });
          return (
            <Animated.View
              key={opt.key}
              style={[styles.optionRow, { opacity: a, transform: [{ translateY }, { rotate }, { scale }] }]}
              pointerEvents="box-none"
            >
              <Pressable style={styles.labelBtn} onPress={() => onPick(opt.step, opt.voice)} hitSlop={6}>
                <Text style={styles.optionLabel}>{t(opt.labelKey)}</Text>
              </Pressable>
              <Pressable
                style={[styles.optionCircle, { backgroundColor: opt.color }]}
                onPress={() => onPick(opt.step, opt.voice)}
                accessibilityRole="button"
                accessibilityLabel={t(opt.labelKey)}
              >
                <EntityIcon type={opt.type} size={22} color="#ffffff" />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // — The tab-bar button — its center sits on the bar's top edge, whatever the bar's height.
    buttonWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    square: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      // half its size
      marginTop: -18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    plusBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    plusBarH: { position: 'absolute', width: 16, height: 2.5, borderRadius: 2, backgroundColor: c.onAccent },
    plusBarV: { position: 'absolute', width: 2.5, height: 16, borderRadius: 2, backgroundColor: c.onAccent },

    // — The overlay —
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)' },
    fan: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    optionRow: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    // The circle is centered; the label sits absolutely to its left.
    optionCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 5,
    },
    labelBtn: {
      position: 'absolute',
      right: '50%',
      marginRight: 38, // half the circle (26) + gap (12)
      justifyContent: 'center',
    },
    optionLabel: {
      backgroundColor: c.card,
      color: c.text,
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
  });
