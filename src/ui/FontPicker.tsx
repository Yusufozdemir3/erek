// "Typeface" card of Profile › Appearance: pick the font the whole app uses.
// Every option is drawn in its own font (the families are loaded when the
// screen opens), so the choice is made by looking, and the app repaints the
// moment one is tapped (fontStore + applyFont).

import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { FONT_CHOICES, FONT_NAMES, fontFamilyFor, type FontChoice } from '@/ui/fontFamily';
import { isFontLoaded, loadFontFiles, setFontChoice, useFontChoice } from '@/ui/fontStore';
import { makeProfileStyles } from '@/ui/profileStyles';
import { useTheme } from '@/ui/ThemeProvider';

export function FontPicker() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeProfileStyles(colors);
  const choice = useFontChoice();
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState<FontChoice | null>(null);

  // Load every family once so each row can show itself; a family that fails to
  // load simply previews in the current font. (Not Promise.allSettled: React
  // Native's own Promise doesn't have it.)
  useEffect(() => {
    let alive = true;
    Promise.all(FONT_CHOICES.map((c) => loadFontFiles(c).catch(() => {}))).then(
      () => alive && setTick((n) => n + 1)
    );
    return () => {
      alive = false;
    };
  }, []);

  const pick = async (next: FontChoice) => {
    if (next === choice || busy) return;
    setBusy(next);
    const ok = await setFontChoice(next);
    setBusy(null);
    if (!ok) Alert.alert(t('profile.fontFailed'));
  };

  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={styles.cardTitle}>{t('profile.font')}</Text>
      <View style={{ gap: 8, marginTop: 4 }}>
        {FONT_CHOICES.map((c) => {
          const on = choice === c;
          const label = c === 'system' ? t('profile.fontSystem') : FONT_NAMES[c];
          // An explicit fontFamily is left alone by applyAppFont, so each row keeps its own font.
          const own = (weight: string) =>
            c === 'system'
              ? { fontFamily: 'sans-serif' }
              : isFontLoaded(c)
                ? { fontFamily: fontFamilyFor(c, weight) }
                : undefined;
          return (
            <Pressable
              key={c}
              onPress={() => pick(c)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primarySoft : 'transparent',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 17, color: colors.text }, own('700') ?? { fontWeight: '700' }]}>{label}</Text>
                <Text style={[{ fontSize: 13, color: colors.muted, marginTop: 2 }, own('400')]}>
                  {t('profile.fontSample')}
                </Text>
              </View>
              {on && <Feather name="check-circle" size={20} color={colors.primary} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('profile.fontHint')}</Text>
    </View>
  );
}
