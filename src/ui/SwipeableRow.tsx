// Row wrapper that reveals Edit+Delete actions on the right when swiped left.
// Used in the Tasks/Habits/Goals lists — DELIBERATELY absent on the "Today"
// screen (there the card already toggles on tap, which would conflict with swipe).
// NO new native dependency was ADDED: react-native-gesture-handler wasn't
// installed, and adding it would require a fresh native build. Instead this is
// built with core React Native PanResponder + Animated (transform: translateX),
// so it's testable immediately in the existing Expo Go / compiled APK.
//
// Delete is confirmed with a second tap (same safety pattern as
// ConfirmDeleteButton — the app has NO single-tap deletes anywhere). Open/closed
// state is kept in the PARENT (isOpen/onOpenChange) so only one row stays open at
// a time — opening a new row automatically closes the previous ones.

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
  // Since gesture callbacks freeze at the first render, the `isOpen` prop is
  // mirrored into a ref to keep it fresh (the classic PanResponder+useRef
  // staleness issue).
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  const offsetRef = useRef(0); // translateX's resting value when the gesture starts
  const [armed, setArmed] = useState(false);

  const animateTo = (value: number) => {
    Animated.spring(translateX, { toValue: value, useNativeDriver: true, bounciness: 0 }).start();
  };

  // Stay in sync if closed externally (another row was opened).
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
      <View style={styles.actions}>
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
      </View>
      <Animated.View
        style={[styles.sliding, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
        {/* While open, tapping the card (including its edges) closes the row and
            doesn't leak through to the edit tap underneath. */}
        {isOpen && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // overflow:'hidden' is CRITICAL — without it, the action panel peeks out from
    // the edges even while the card is closed (this was the reported visual glitch).
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
