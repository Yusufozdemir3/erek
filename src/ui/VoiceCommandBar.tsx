// The Today screen's "check off by voice" strip: a mic and one line of status.
// Idle it shows an example sentence; while listening, what's been heard so
// far; after a command, what happened with an Undo link for a few seconds.
//
// What a sentence MEANS is decided by the screen (onHeard): it knows today's
// items and owns the writes. This component only runs the mic and the notice.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { useTheme } from '@/ui/ThemeProvider';
import { useVoiceInput } from '@/ui/useVoiceInput';
import { VoiceButton } from '@/ui/VoiceButton';
import type { Colors } from '@/ui/theme';

export interface CommandNotice {
  text: string;
  undo?: () => void;
}

// How long the result (and its Undo) stays on screen.
export const NOTICE_MS = 8000;

interface Props {
  // Called with the final transcript. `show` puts a notice on the strip (call
  // it right away, or later — e.g. after the user picked from a list).
  onHeard: (text: string, show: (notice: CommandNotice) => void) => void;
}

export function VoiceCommandBar({ onHeard }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [notice, setNotice] = useState<CommandNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((n: CommandNotice) => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(n);
    timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const voice = useVoiceInput((heard) => onHeard(heard, show));
  // The mic is hidden on devices without speech recognition (no dead button).
  if (!voice.supported) return null;

  const undo = () => {
    notice?.undo?.();
    show({ text: t('voiceCmd.undone') });
  };

  const line = voice.listening
    ? voice.partial || t('voice.listening')
    : (voice.error ?? notice?.text ?? t('voiceCmd.hint'));
  const showUndo = !voice.listening && !voice.error && !!notice?.undo;

  return (
    <View style={styles.row}>
      <VoiceButton listening={voice.listening} onPress={voice.toggle} label={t('voiceCmd.startA11y')} />
      <Text
        style={[styles.text, voice.error ? styles.error : notice && !voice.listening ? styles.notice : null]}
        numberOfLines={3}
        accessibilityLiveRegion="polite"
      >
        {line}
      </Text>
      {showUndo && (
        <Pressable onPress={undo} hitSlop={8} accessibilityRole="button">
          <Text style={styles.undo}>{t('voice.undo')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
    text: { flex: 1, fontSize: 13, color: c.muted },
    notice: { color: c.text, fontWeight: '600' },
    error: { color: c.danger },
    undo: { fontSize: 14, fontWeight: '800', color: c.primary },
  });
