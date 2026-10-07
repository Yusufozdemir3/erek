// "Remind your friend": a push to the item's OWNER through the send-nudge Edge
// Function — who reminded them, and the item's title (hidden on the lock
// screen). When it can't be delivered (no device registered, notifications
// off, offline) a ready-made message through the share sheet is offered
// instead, which also stays available as a small link.

import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { notifySuccess } from '@/lib/haptics';
import { sendNudge } from '@/sync';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';

interface Props {
  kind: 'habit' | 'goal';
  itemId: string; // the shared item's cloud id
  ownerName: string;
  message: string; // the share-sheet fallback text
}

type State = 'idle' | 'sending' | 'sent' | 'alreadyToday' | 'dailyLimit';

export function NudgeButton({ kind, itemId, ownerName, message }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [state, setState] = useState<State>('idle');

  const share = () => Share.share({ message }).catch(() => {});
  const offerShare = (title: string, body: string) =>
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('nudge.shareInstead'), onPress: share },
    ]);

  const send = async () => {
    if (state !== 'idle') return;
    setState('sending');
    const result = await sendNudge(kind, itemId);
    if (result === 'sent') {
      notifySuccess();
      setState('sent');
    } else if (result === 'alreadyToday' || result === 'dailyLimit') {
      setState(result);
    } else {
      setState('idle');
      if (result === 'noDevice') offerShare(t('nudge.noDeviceTitle'), t('nudge.noDeviceBody', { name: ownerName }));
      else offerShare(t('nudge.failedTitle'), t('nudge.failedBody'));
    }
  };

  const label =
    state === 'sending'
      ? t('nudge.sending')
      : state === 'sent'
        ? t('nudge.sent', { name: ownerName })
        : t('friends.nudge');
  const note = state === 'alreadyToday' ? t('nudge.alreadyToday') : state === 'dailyLimit' ? t('nudge.dailyLimit') : null;

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
        <Feather name={state === 'sent' ? 'check' : 'bell'} size={16} color={colors.primary} />
        <Text style={styles.text}>{label}</Text>
      </Pressable>
      {note && <Text style={styles.note}>{note}</Text>}
      <Pressable onPress={share} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>{t('nudge.viaMessage')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { alignSelf: 'flex-start', marginTop: 12, gap: 6 },
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
    note: { fontSize: 12, color: c.muted },
    link: { fontSize: 12, color: c.muted, textDecorationLine: 'underline' },
  });
