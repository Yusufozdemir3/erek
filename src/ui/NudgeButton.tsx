// "Remind your friend": opens the system share sheet with a ready-made nudge
// (WhatsApp, SMS, …). Deliberately NOT a push notification — that would need
// device-token storage and a server-side sender (and new privacy disclosures);
// a message through the channel you already chat on works today and sends
// nothing through our servers.

import { Pressable, Share, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

export function NudgeButton({ message }: { message: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  return (
    <Pressable
      style={styles.btn}
      onPress={() => Share.share({ message }).catch(() => {})}
      accessibilityRole="button"
      accessibilityLabel={t('friends.nudge')}
    >
      <Feather name="bell" size={16} color={colors.primary} />
      <Text style={styles.text}>{t('friends.nudge')}</Text>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      marginTop: 12,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
    },
    text: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
