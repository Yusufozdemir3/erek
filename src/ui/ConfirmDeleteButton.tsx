// İki adımlı silme onayı: ilk basış onaya alır, ikinci basış siler.
// Task/Habit/Goal düzenleme panellerinin üçünde de birebir aynı desendi;
// tek bileşende toplanmış. Panel her kapanıp açıldığında (parent unmount eder)
// kendi state'i sıfırlanır — ayrı bir reset mekanizması gerekmez.

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
