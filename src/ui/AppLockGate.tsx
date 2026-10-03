// The lock screen. A Modal on purpose: on Android a Modal is its own window, so
// this cover also sits above a task/habit sheet that was open when the lock
// kicked in — a plain overlay View would leave that sheet readable.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { useAppLock } from '@/ui/useAppLock';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

export function AppLockGate() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { ready, locked, busy, unlock } = useAppLock();
  const styles = makeStyles(colors);
  const visible = !ready || locked;

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.root}>
        {ready && (
          <>
            <Feather name="lock" size={40} color={colors.primary} />
            <Text style={styles.title}>{t('lock.title')}</Text>
            <Pressable
              style={[styles.btn, busy && { opacity: 0.6 }]}
              onPress={unlock}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('lock.unlock')}
            >
              <Text style={styles.btnText}>{t('lock.unlock')}</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: c.bg, padding: 32 },
    title: { fontSize: 20, fontWeight: '800', color: c.text },
    btn: { marginTop: 8, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
    btnText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  });
