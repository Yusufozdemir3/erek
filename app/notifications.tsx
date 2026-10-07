// Profile › Notifications. Any change rebuilds the reminders from the DB at
// once — on Android sound and vibration are fixed by the channel chosen when a
// notification is scheduled, so rebuilding moves them to the new channel.

import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { goalRepo, habitRepo, taskRepo } from '@/db';
import {
  rescheduleAllGoalReminders,
  rescheduleAllReminders,
  rescheduleAllTaskReminders,
  scheduleWeeklyReview,
} from '@/lib/notifications';
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  setCustomSound,
  setNotificationPref,
  type BoolPrefKey,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';
import { getCustomSoundTitle } from '@/lib/customNotificationChannel';
import { pickNotificationSound } from '@/lib/ringtonePicker';
import { syncPushRegistration } from '@/lib/pushRegistration';
import { getNudgePrefs, setNudgesEnabled } from '@/sync';
import { useAppData } from '@/ui/AppData';
import { FeatureGuide } from '@/ui/guide/FeatureGuide';
import { useFeatureGuide } from '@/ui/guide/useFeatureGuide';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { switchColors, type Colors } from '@/ui/theme';

// Reminder type rows (all faded + disabled while the master switch is off).
const TYPE_ROWS: { key: BoolPrefKey; labelKey: string }[] = [
  { key: 'habitReminders', labelKey: 'profile.notifHabitReminders' },
  { key: 'taskReminders', labelKey: 'profile.notifTaskReminders' },
  { key: 'goalReminders', labelKey: 'profile.notifGoalReminders' },
  { key: 'timerDone', labelKey: 'profile.notifTimerDone' },
  { key: 'weeklyReview', labelKey: 'profile.notifWeeklyReview' },
];

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { user, authUser } = useAppData();
  const uid = authUser && !authUser.isAnonymous ? authUser.id : null;
  const guide = useFeatureGuide('notifications');
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  // Friend nudges: an ACCOUNT preference kept on the server (it decides
  // whether a friend's nudge is delivered), unlike the device prefs above.
  const [nudgesOn, setNudgesOn] = useState<boolean | null>(null);

  useEffect(() => {
    getNotificationPrefs().then(setPrefs);
  }, []);

  useEffect(() => {
    if (!uid) return;
    getNudgePrefs()
      .then((p) => p && setNudgesOn(p.enabled))
      .catch(() => {});
  }, [uid]);

  const toggleNudges = async (value: boolean) => {
    setNudgesOn(value);
    if (!(await setNudgesEnabled(value).catch(() => false))) setNudgesOn(!value);
  };

  const rescheduleAll = () => {
    rescheduleAllReminders(habitRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Notification] Failed to rebuild after preference change:', e)
    );
    rescheduleAllTaskReminders(taskRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Notification] Failed to rebuild task reminders after preference change:', e)
    );
    rescheduleAllGoalReminders(goalRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Notification] Failed to rebuild goal reminders after preference change:', e)
    );
  };

  const toggle = (key: BoolPrefKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    const saved = setNotificationPref(key, value).catch(() => {});
    rescheduleAll();
    // The master switch also gates friend nudges (pushRegistration.ts): apply now.
    if (key === 'enabled') saved.then(() => syncPushRegistration(uid, lang));
    // The weekly review has no entity, so it's applied separately.
    if (key === 'enabled' || key === 'weeklyReview') saved.then(() => scheduleWeeklyReview());
  };

  // A pick (Silent included) is saved and applied; cancel changes nothing.
  const choosePickedSound = async () => {
    const result = await pickNotificationSound(prefs.customSoundUri);
    if (result.canceled) return;
    const name = result.uri ? getCustomSoundTitle(result.uri) : null;
    setPrefs((p) => ({ ...p, customSoundUri: result.uri, customSoundName: name }));
    setCustomSound(result.uri, name).catch(() => {});
    rescheduleAll();
  };

  const removeCustomSound = () => {
    setPrefs((p) => ({ ...p, customSoundUri: null, customSoundName: null }));
    setCustomSound(null, null).catch(() => {});
    rescheduleAll();
  };

  const off = !prefs.enabled;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={guide.open} hitSlop={8} style={styles.guideLink} accessibilityRole="button">
        <Text style={styles.guideLinkText}>{t('notifications.guideLink')}</Text>
      </Pressable>
      <FeatureGuide guide="notifications" visible={guide.visible} onClose={guide.close} canShare={uid != null} />
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('profile.notifEnabled')}</Text>
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => toggle('enabled', v)}
            {...switchColors(colors, prefs.enabled)}
          />
        </View>

        {TYPE_ROWS.map(({ key, labelKey }) => (
          <View
            key={key}
            style={[styles.switchRow, styles.switchRowSpaced, off && styles.rowDisabled]}
          >
            <Text style={styles.switchLabel}>{t(labelKey)}</Text>
            <Switch
              value={prefs[key]}
              onValueChange={(v) => toggle(key, v)}
              disabled={off}
              {...switchColors(colors, prefs[key])}
            />
          </View>
        ))}
      </View>

      {/* Each sound × vibration combination is its own Android channel. */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('notifications.soundVibrationTitle')}</Text>
        <View style={[styles.switchRow, off && styles.rowDisabled]}>
          <Text style={styles.switchLabel}>{t('notifications.sound')}</Text>
          <Switch
            value={prefs.sound}
            onValueChange={(v) => toggle('sound', v)}
            disabled={off}
            {...switchColors(colors, prefs.sound)}
          />
        </View>
        <View style={[styles.switchRow, styles.switchRowSpaced, off && styles.rowDisabled]}>
          <Text style={styles.switchLabel}>{t('notifications.vibration')}</Text>
          <Switch
            value={prefs.vibration}
            onValueChange={(v) => toggle('vibration', v)}
            disabled={off}
            {...switchColors(colors, prefs.vibration)}
          />
        </View>
        <Text style={styles.hint}>{t('notifications.soundVibrationHint')}</Text>
      </View>

      {/* Android only, and hidden without the native module. */}
      {Platform.OS === 'android' && (
        <View style={[styles.card, { marginTop: 16 }, off && styles.rowDisabled]}>
          <Text style={styles.cardTitle}>{t('notifications.customSoundTitle')}</Text>
          <View style={[styles.switchRow, { marginTop: 12 }]}>
            <Text style={styles.switchLabel}>
              {prefs.customSoundUri
                ? prefs.customSoundName ?? t('notifications.customSoundUnknown')
                : t('notifications.customSoundDefault')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {prefs.customSoundUri && (
                <Pressable
                  disabled={off}
                  onPress={removeCustomSound}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('notifications.customSoundRemove')}
                >
                  <Text style={[styles.linkBtn, { color: colors.danger }]}>
                    {t('notifications.customSoundRemove')}
                  </Text>
                </Pressable>
              )}
              <Pressable
                disabled={off}
                onPress={choosePickedSound}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t(
                  prefs.customSoundUri ? 'notifications.customSoundChange' : 'notifications.customSoundChoose'
                )}
              >
                <Text style={styles.linkBtn}>
                  {t(prefs.customSoundUri ? 'notifications.customSoundChange' : 'notifications.customSoundChoose')}
                </Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.hint}>{t('notifications.customSoundHint')}</Text>
        </View>
      )}

      {uid && nudgesOn !== null && (
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('notifications.friendNudges')}</Text>
            <Switch value={nudgesOn} onValueChange={toggleNudges} {...switchColors(colors, nudgesOn)} />
          </View>
          <Text style={styles.hint}>{t('notifications.friendNudgesHint')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
    guideLink: { alignSelf: 'flex-start', marginBottom: 12 },
    guideLinkText: { fontSize: 14, fontWeight: '700', color: c.primary },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginBottom: 12 },
    hint: { fontSize: 12, color: c.faint, marginTop: 12 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchRowSpaced: { marginTop: 14 },
    switchLabel: { fontSize: 14, color: c.text, flex: 1, marginRight: 12 },
    rowDisabled: { opacity: 0.4 },
    linkBtn: { fontSize: 13, fontWeight: '700', color: c.primary },
  });
