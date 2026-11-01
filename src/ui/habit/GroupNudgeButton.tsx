// Small bell next to a member who hasn't marked today: a push "X reminded you"
// through the send-nudge Edge Function (the server accepts it because both are
// in the same group). When it can't be delivered, the reason is shown.

import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { notifySuccess } from '@/lib/haptics';
import { sendNudge } from '@/sync';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

type State = 'idle' | 'sending' | 'sent';

export function GroupNudgeButton({ habitId, name }: { habitId: string; name: string }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [state, setState] = useState<State>('idle');

  const send = async () => {
    if (state !== 'idle') return;
    setState('sending');
    const result = await sendNudge('habit', habitId);
    if (result === 'sent') {
      notifySuccess();
      setState('sent');
      return;
    }
    setState('idle');
    if (result === 'alreadyToday') Alert.alert(t('nudge.alreadyToday'));
    else if (result === 'dailyLimit') Alert.alert(t('nudge.dailyLimit'));
    else if (result === 'noDevice') Alert.alert(t('nudge.noDeviceTitle'), t('nudge.noDeviceBody', { name }));
    else Alert.alert(t('nudge.failedTitle'), t('nudge.failedBody'));
  };

  if (state === 'sent') return <Text style={styles.sent}>{t('group.nudged')}</Text>;
  return (
    <Pressable
      style={[styles.btn, state === 'sending' && styles.busy]}
      onPress={send}
      disabled={state === 'sending'}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('group.nudgeA11y', { name })}
    >
      <Feather name="bell" size={14} color={colors.primary} />
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    btn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    busy: { opacity: 0.5 },
    sent: { fontSize: 12, fontWeight: '600', color: c.done },
  });
