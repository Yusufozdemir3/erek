// The central ＋ quick-add button (speed-dial).
// ＋ is a square button; tapping it rotates it 45° into an ×, and three
// options (Task · Habit · Goal) fan open upward with a spring (swing) motion.
// Picking an option opens the relevant type directly in the AddSheet form.
//
// Two pieces are driven together by the same `open` state:
//   • AddFabButton — the square button in the middle of the tab bar (the rotating ＋).
//   • AddFab       — the full-screen overlay (backdrop + the spring-out options).
// Since the overlay wouldn't fit inside the tab bar, it's drawn as a sibling of
// Tabs in _layout (on top of it).

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@/ui/AddSheet';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import { tapMedium } from '@/lib/haptics';
import type { Colors } from '@/ui/theme';

type AddStep = Exclude<Step, 'menu'>;

// Fixed accent colors for the option circles (readable in both theme modes).
// Icon: the same line-icon set as the tab bar (EntityIcon); label is an i18n
// key (the same 'add.*' keys as the AddSheet menu — single source, consistent text).
const OPTIONS: { step: AddStep; type: EntityType; labelKey: string; color: string }[] = [
  { step: 'goal', type: 'goal', labelKey: 'add.goal', color: '#f59e0b' },
  { step: 'habit', type: 'habit', labelKey: 'add.habit', color: '#f97316' },
  { step: 'task', type: 'task', labelKey: 'add.task', color: '#6366f1' },
];

// The square ＋ button in the tab bar. While `open`, ＋ rotates 45° into an ×.
// A LONG PRESS opens a separate action (independent timer picker — see
// TimerPicker); `onLongPress` is left optional so it doesn't CONFLICT with a
// short tap (if not passed, the button reacts only to short taps, as before).
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
      {/* The whole square frame rotates; the ＋ inside rotates with it into an ×.
          The ＋ is drawn with two bars → independent of font metrics, perfectly centered. */}
      <Animated.View style={[styles.square, { transform: [{ rotate }] }]}>
        <View style={styles.plusBox}>
          <View style={styles.plusBarH} />
          <View style={styles.plusBarV} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

// The full-screen overlay: backdrop + options that spring open.
export function AddFab({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (step: AddStep) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // A separate animation value per option (staggered spring entrance) + backdrop.
  const anims = useRef(OPTIONS.map(() => new Animated.Value(0))).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  // Separate mount state so it stays in the tree until the close animation finishes.
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

      <View style={styles.fan} pointerEvents="box-none">
        {OPTIONS.map((opt, i) => {
          const a = anims[i];
          // The spring: glides from bottom to top, arriving with a slight "swing" rotation.
          const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [56, 0] });
          const scale = a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
          const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] });
          return (
            <Animated.View
              key={opt.step}
              style={[styles.optionRow, { opacity: a, transform: [{ translateY }, { rotate }, { scale }] }]}
              pointerEvents="box-none"
            >
              <Pressable style={styles.labelBtn} onPress={() => onPick(opt.step)} hitSlop={6}>
                <Text style={styles.optionLabel}>{t(opt.labelKey)}</Text>
              </Pressable>
              <Pressable
                style={[styles.optionCircle, { backgroundColor: opt.color }]}
                onPress={() => onPick(opt.step)}
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
    // — The square button in the tab bar —
    // Align to top (flex-start) + shift up by half its own size (18): this way
    // the square's vertical center sits exactly on the top edge, INDEPENDENT of
    // the bar's height. When rotated 45°, the side corners line up with the edge.
    buttonWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
    square: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      // Centers the square on the bar's top edge (half up = -18).
      marginTop: -18,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    // The ＋ mark is drawn with two bars; the box is 16×16, bars perfectly centered.
    plusBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    plusBarH: { position: 'absolute', width: 16, height: 2.5, borderRadius: 2, backgroundColor: c.onAccent },
    plusBarV: { position: 'absolute', width: 2.5, height: 16, borderRadius: 2, backgroundColor: c.onAccent },

    // — The opening overlay —
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.35)' },
    fan: {
      // Options are laid out centered, right above the tab bar.
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 96,
      alignItems: 'center',
    },
    optionRow: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    // The circle sits dead center; the label is positioned absolutely to its left.
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
