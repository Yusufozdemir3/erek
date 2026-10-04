// The bar at the bottom of a list tab after something was deleted: what went,
// and an Undo for a few seconds. Deleting is already a two-tap action in the
// swipe panel; this is the second safety net.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export const UNDO_MS = 6000;

export interface UndoNotice {
  text: string;
  onUndo: () => void;
}

// State + timer for one snackbar: show(notice) replaces any current one.
export function useUndoNotice() {
  const [notice, setNotice] = useState<UndoNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNotice(null);
  }, []);
  const show = useCallback(
    (n: UndoNotice) => {
      if (timer.current) clearTimeout(timer.current);
      setNotice(n);
      timer.current = setTimeout(dismiss, UNDO_MS);
    },
    [dismiss]
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return { notice, show, dismiss };
}

export function UndoSnackbar({ notice, onDone }: { notice: UndoNotice | null; onDone: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  if (!notice) return null;
  return (
    <View style={styles.bar} accessibilityLiveRegion="polite">
      <Text style={styles.text} numberOfLines={2}>
        {notice.text}
      </Text>
      <Pressable
        onPress={() => {
          notice.onUndo();
          onDone();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('voice.undo')}
      >
        <Text style={styles.undo}>{t('voice.undo')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 4,
      minHeight: 52,
      borderRadius: 12,
      backgroundColor: c.text,
    },
    text: { flex: 1, fontSize: 14, color: c.bg },
    undo: { fontSize: 14, fontWeight: '800', color: c.bg, textDecorationLine: 'underline', paddingVertical: 12, paddingHorizontal: 4 },
  });
