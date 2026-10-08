// Swipe a row left to reveal Edit + Delete (Tasks/Habits/Goals lists — not
// Today, where tapping the card already checks it). Built with PanResponder +
// Animated, so no gesture-handler native dependency. Delete needs a second tap,
// like everywhere in the app. The parent owns isOpen, so one row is open at a time.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

const ACTION_WIDTH = 56;
const ACTIONS_WIDTH = ACTION_WIDTH * 2;
const OPEN_THRESHOLD = ACTIONS_WIDTH / 2;

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editA11yLabel: string;
  deleteA11yLabel: string;
  children: ReactNode;
}

export function SwipeableRow({
  onEdit,
  onDelete,
  isOpen,
  onOpenChange,
  editA11yLabel,
  deleteA11yLabel,
  children,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const translateX = useRef(new Animated.Value(0)).current;
  // The PanResponder's callbacks are created once, so they read isOpen via a ref.
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  const offsetRef = useRef(0); // translateX at gesture start
  const [armed, setArmed] = useState(false);

  const animateTo = (value: number) => {
    Animated.spring(translateX, { toValue: value, useNativeDriver: true, bounciness: 0 }).start();
  };

  // Closed from outside (another row opened).
  useEffect(() => {
    if (!isOpen) {
      animateTo(0);
      setArmed(false);
    }
  }, [isOpen]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        offsetRef.current = isOpenRef.current ? -ACTIONS_WIDTH : 0;
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, Math.max(-ACTIONS_WIDTH, offsetRef.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const next = offsetRef.current + g.dx;
        const shouldOpen = next < -OPEN_THRESHOLD;
        animateTo(shouldOpen ? -ACTIONS_WIDTH : 0);
        onOpenChange(shouldOpen);
        if (!shouldOpen) setArmed(false);
      },
    })
  ).current;

  const close = () => {
    animateTo(0);
    onOpenChange(false);
    setArmed(false);
  };

  const handleDeletePress = () => {
    if (armed) onDelete();
    else setArmed(true);
  };

  return (
    <View style={styles.container}>
      {/* Invisible until the card starts sliding, so a translucent or
          rounded-corner card never shows the buttons behind it. */}
      <Animated.View
        style={[styles.actions, { opacity: translateX.interpolate({ inputRange: [-12, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}
      >
        <Pressable
          style={styles.actionBtn}
          onPress={() => {
            close();
            onEdit();
          }}
          accessibilityRole="button"
          accessibilityLabel={editA11yLabel}
        >
          <Feather name="edit-3" size={20} color={colors.onAccent} />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn, armed && styles.deleteBtnArmed]}
          onPress={handleDeletePress}
          accessibilityRole="button"
          accessibilityLabel={armed ? t('common.deleteConfirm') : deleteA11yLabel}
        >
          <Feather name="trash-2" size={20} color={colors.onAccent} />
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[styles.sliding, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
        {/* While open, a tap on the card only closes it. */}
        {isOpen && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // Without overflow hidden the actions peek out of a closed card.
    container: { overflow: 'hidden', borderRadius: 14 },
    sliding: { width: '100%' },
    actions: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      flexDirection: 'row',
      borderRadius: 14,
      overflow: 'hidden',
    },
    actionBtn: {
      width: ACTION_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    deleteBtn: { backgroundColor: c.danger },
    deleteBtnArmed: { backgroundColor: '#7f1d1d' },
  });
