// Two-step delete confirmation: the first press arms it, the second deletes.
// This was the exact same pattern in all three of the Task/Habit/Goal edit
// panels; consolidated into a single component. Its own state resets every
// time the panel closes and reopens (the parent unmounts it) — no separate reset mechanism needed.

import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

interface Props {
  onConfirm: () => void;
}

export function ConfirmDeleteButton({ onConfirm }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [armed, setArmed] = useState(false);

  return (
    <Pressable
      style={[styles.btn, armed && styles.btnArmed]}
      onPress={() => (armed ? onConfirm() : setArmed(true))}
      accessibilityRole="button"
      accessibilityLabel={armed ? t('common.deleteConfirm') : t('common.delete')}
    >
      <Text style={[styles.text, armed && styles.textArmed]}>
        {armed ? t('common.deleteConfirm') : t('common.delete')}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      backgroundColor: c.card,
    },
    btnArmed: { backgroundColor: c.danger, borderColor: c.danger },
    text: { fontSize: 15, fontWeight: '700', color: c.danger },
    textArmed: { color: c.onAccent },
  });
