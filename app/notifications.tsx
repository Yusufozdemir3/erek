// Bildirimler ekranı (modal) — eskiden Profil'deki "Bildirimler" kartıydı; ses ve
// titreşim ayrı denetimler haline gelince (bkz. notificationPrefs + kanal mimarisi)
// kart şişti ve kendi sayfasına taşındı. Profil'den ok'lu bir satırla açılır.
// Başlığı kök layout'taki native header verir.
//
// Bir tercih değişince ilgili tüm hatırlatmalar DB baz alınarak HEMEN yeniden
// kurulur: ses/titreşim değişimi de dahil, çünkü Android'de kanal (dolayısıyla
// ses/titreşim) bildirime schedule ANINDA gömülür — yeniden kurmak eski kanaldan
// yeni kanala taşır.

import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { goalRepo, habitRepo, taskRepo } from '@/db';
import {
  rescheduleAllGoalReminders,
  rescheduleAllReminders,
  rescheduleAllTaskReminders,
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
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { type Colors } from '@/ui/theme';

// Hatırlatma türü satırları (ana anahtar kapalıyken hepsi soluk + disabled).
const TYPE_ROWS: { key: BoolPrefKey; labelKey: string }[] = [
  { key: 'habitReminders', labelKey: 'profile.notifHabitReminders' },
  { key: 'taskReminders', labelKey: 'profile.notifTaskReminders' },
  { key: 'goalReminders', labelKey: 'profile.notifGoalReminders' },
  { key: 'timerDone', labelKey: 'profile.notifTimerDone' },
];

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    getNotificationPrefs().then(setPrefs);
  }, []);

  // Ses/titreşim/özel-ses değişince tüm hatırlatmaları DB'yi baz alarak yeniden
  // kurar (scheduleX'in kendi cancel-then-maybe-schedule mantığı açma/kapamayı
  // ve kanal değişimini otomatik halleder).
  const rescheduleAll = () => {
    rescheduleAllReminders(habitRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Bildirim] Tercih sonrası yeniden kurulum başarısız:', e)
    );
    rescheduleAllTaskReminders(taskRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Bildirim] Tercih sonrası görev yeniden kurulumu başarısız:', e)
    );
    rescheduleAllGoalReminders(goalRepo.listByUser(user.id)).catch((e) =>
      console.warn('[Bildirim] Tercih sonrası hedef yeniden kurulumu başarısız:', e)
    );
  };

  const toggle = (key: BoolPrefKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setNotificationPref(key, value).catch(() => {});
    rescheduleAll();
  };

  // Cihazın zil sesi seçicisini açar; seçim yapılırsa (Sessiz dahil) kaydeder
  // ve hatırlatmaları yeniden kurar. İptalde hiçbir şey değişmez.
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
      {/* Ana anahtar + hatırlatma türleri */}
      <View style={styles.card}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('profile.notifEnabled')}</Text>
          <Switch
            value={prefs.enabled}
            onValueChange={(v) => toggle('enabled', v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
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
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.card}
            />
          </View>
        ))}
      </View>

      {/* Ses ve titreşim — AYRI iki anahtar. Android'de her kombinasyon ayrı bir
          bildirim kanalına gider (bkz. notifications.ts). */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('notifications.soundVibrationTitle')}</Text>
        <View style={[styles.switchRow, off && styles.rowDisabled]}>
          <Text style={styles.switchLabel}>{t('notifications.sound')}</Text>
          <Switch
            value={prefs.sound}
            onValueChange={(v) => toggle('sound', v)}
            disabled={off}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <View style={[styles.switchRow, styles.switchRowSpaced, off && styles.rowDisabled]}>
          <Text style={styles.switchLabel}>{t('notifications.vibration')}</Text>
          <Switch
            value={prefs.vibration}
            onValueChange={(v) => toggle('vibration', v)}
            disabled={off}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.card}
          />
        </View>
        <Text style={styles.hint}>{t('notifications.soundVibrationHint')}</Text>
      </View>

      {/* Özel bildirim sesi — Android'e özgü (bkz. ringtonePicker.ts +
          customNotificationChannel.ts). Sistem sesi seçici bir native modül
          gerektirir; henüz derlenmemiş bir build'de/iOS'ta gizli kalır. */}
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
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },
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
