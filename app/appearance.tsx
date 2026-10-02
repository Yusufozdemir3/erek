// "Appearance" sub-screen of Profile — theme, accent color, language, the
// Today-screen preference and in-app haptics. Split out of the Profile page,
// which grew too long as one flat list.

import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { isHapticsEnabled, setHapticsEnabled, tapLight } from '@/lib/haptics';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme, type ThemeMode } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { LANG_LABELS, SUPPORTED_LANGS } from '@/i18n/translations';
import { ACCENT_ORDER, ACCENT_THEMES, switchColors } from '@/ui/theme';

const THEME_OPTIONS: { mode: ThemeMode; labelKey: string }[] = [
  { mode: 'light', labelKey: 'profile.themeLight' },
  { mode: 'dark', labelKey: 'profile.themeDark' },
  { mode: 'system', labelKey: 'profile.themeSystem' },
];

export default function AppearanceScreen() {
  const { colors, scheme, mode, setMode, accent, setAccent, darkStyle, setDarkStyle } = useTheme();
  const { t, lang, setLang } = useI18n();
  const styles = makeProfileStyles(colors);
  const { hideCompleted, setHideCompleted } = useAppData();
  // Haptics preference; the cache is loaded at startup (see _layout), so the
  // initial value here is correct right away.
  const [haptics, setHaptics] = useState(isHapticsEnabled);

  // Toggle haptics on/off — turning it off silences touches immediately (cache
  // is written first).
  const toggleHaptics = (value: boolean) => {
    setHaptics(value);
    setHapticsEnabled(value).catch(() => {});
    if (value) tapLight(); // one sample buzz when turning it on so the user feels what they just enabled
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Appearance (theme) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('profile.appearance')}</Text>
        <View style={styles.segRow}>
          {THEME_OPTIONS.map((opt) => {
            const on = mode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setMode(opt.mode)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('profile.systemHint')}</Text>

        {/* Dark theme style — warm ink / true black (AMOLED). Stays selectable
            in light theme too; it takes effect once dark theme is active. */}
        <Text style={styles.subCardTitle}>{t('profile.darkStyle')}</Text>
        <View style={styles.segRow}>
          {(
            [
              { style: 'warm', labelKey: 'profile.darkWarm' },
              { style: 'black', labelKey: 'profile.darkBlack' },
            ] as { style: 'warm' | 'black'; labelKey: string }[]
          ).map((opt) => {
            const on = darkStyle === opt.style;
            return (
              <Pressable
                key={opt.style}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setDarkStyle(opt.style)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{t(opt.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Accent (brand) color */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.accentColor')}</Text>
        <View style={styles.accentRow}>
          {ACCENT_ORDER.map((key) => {
            const on = accent === key;
            const swatch = ACCENT_THEMES[key][scheme].primary;
            return (
              <Pressable
                key={key}
                style={styles.accentItem}
                onPress={() => setAccent(key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`profile.accent.${key}`)}
              >
                <View
                  style={[styles.accentSwatch, { backgroundColor: swatch }, on && styles.accentSwatchOn]}
                >
                  {on && <Text style={styles.accentCheck}>✓</Text>}
                </View>
                <Text style={styles.accentLabel}>{t(`profile.accent.${key}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Language */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.language')}</Text>
        <View style={styles.segRow}>
          {SUPPORTED_LANGS.map((l) => {
            const on = lang === l;
            return (
              <Pressable
                key={l}
                style={[styles.segBtn, on && styles.segBtnOn]}
                onPress={() => setLang(l)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{LANG_LABELS[l]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Today screen preferences */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.todayScreen')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('today.hideCompleted')}</Text>
          <Switch
            value={hideCompleted}
            onValueChange={setHideCompleted}
            {...switchColors(colors, hideCompleted)}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hideCompletedHint')}</Text>
      </View>

      {/* Haptics (in-app tactile feedback) — SEPARATE from notification vibration:
          this is the feedback you feel on touches like checking off/+−/timer. */}
      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.cardTitle}>{t('profile.haptics')}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{t('profile.hapticsEnabled')}</Text>
          <Switch
            value={haptics}
            onValueChange={toggleHaptics}
            {...switchColors(colors, haptics)}
          />
        </View>
        <Text style={styles.hint}>{t('profile.hapticsHint')}</Text>
      </View>
    </ScrollView>
  );
}
