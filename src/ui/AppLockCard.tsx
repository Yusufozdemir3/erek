// The "App lock" switch (Privacy screen). Turning it ON first asks the phone's
// screen lock once — proof that the person can pass it, so the lock can't be
// switched on by accident and then lock them out.

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { authenticate, isLockEnabled, lockAvailable, setLockEnabled } from '@/lib/appLock';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { switchColors, type Colors } from '@/ui/theme';

export function AppLockCard() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const local = makeStyles(colors);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    isLockEnabled().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (!next) {
        await setLockEnabled(false);
        setOn(false);
        return;
      }
      if (!(await lockAvailable())) {
        Alert.alert(t('lock.cardTitle'), t('lock.noScreenLock'));
        return;
      }
      const outcome = await authenticate(t('lock.prompt'), t('common.cancel'));
      if (outcome !== 'ok') {
        if (outcome === 'unavailable') Alert.alert(t('lock.cardTitle'), t('lock.noScreenLock'));
        else Alert.alert(t('lock.cardTitle'), t('lock.confirmFailed'));
        return;
      }
      await setLockEnabled(true);
      setOn(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, { marginTop: 20 }]}>
      <Text style={styles.cardTitle}>{t('lock.cardTitle')}</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('lock.switchLabel')}</Text>
        <Switch
          value={on}
          onValueChange={toggle}
          disabled={busy}
          {...switchColors(colors, on)}
          accessibilityLabel={t('lock.switchLabel')}
        />
      </View>
      <Text style={local.hint}>{t('lock.hint')}</Text>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    hint: { fontSize: 12, lineHeight: 18, color: c.faint, marginTop: 10 },
  });
