// "Congratulate": shown on a friend's shared goal / habit / task once it is
// finished. One tap sends a push to the owner through the send-nudge Edge
// Function (action "congrats"); it works once per item, and when it can't be
// delivered a ready-made message through the share sheet is offered instead.

import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { notifySuccess } from '@/lib/haptics';
import type { CelebrationKind } from '@/lib/celebrations';
import { sendCongrats } from '@/sync';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  kind: CelebrationKind;
  itemId: string; // the shared item's cloud id
  ownerName: string;
  title: string; // the item's title (for the share-sheet fallback)
}

type State = 'idle' | 'sending' | 'sent' | 'already';

export function CongratsButton({ kind, itemId, ownerName, title }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [state, setState] = useState<State>('idle');

  const share = () => Share.share({ message: t('congrats.message', { name: ownerName, title }) }).catch(() => {});
  const offerShare = (heading: string, body: string) =>
    Alert.alert(heading, body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('nudge.shareInstead'), onPress: share },
    ]);

  const send = async () => {
    if (state !== 'idle') return;
    setState('sending');
    const result = await sendCongrats(kind, itemId);
    if (result === 'sent') {
      notifySuccess();
      setState('sent');
    } else if (result === 'already') {
      setState('already');
    } else {
      setState('idle');
      if (result === 'noDevice') offerShare(t('congrats.noDeviceTitle'), t('congrats.noDeviceBody', { name: ownerName }));
      else if (result === 'notFinished') offerShare(t('congrats.notYetTitle'), t('congrats.notYetBody'));
      else if (result === 'dailyLimit') Alert.alert(t('congrats.limitTitle'), t('congrats.limitBody'));
      else offerShare(t('nudge.failedTitle'), t('nudge.failedBody'));
    }
  };

  const done = state === 'sent' || state === 'already';
  const label =
    state === 'sending'
      ? t('nudge.sending')
      : state === 'sent'
        ? t('congrats.sent', { name: ownerName })
        : state === 'already'
          ? t('congrats.already', { name: ownerName })
          : t('congrats.button');

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.btn, state !== 'idle' && styles.btnDone]}
        onPress={send}
        disabled={state !== 'idle'}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: state !== 'idle', busy: state === 'sending' }}
      >
        <Feather name={done ? 'check' : 'award'} size={16} color={colors.primary} />
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignSelf: 'flex-start', marginTop: 12 },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary,
    },
    btnDone: { opacity: 0.7 },
    text: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
