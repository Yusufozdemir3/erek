// The buttons on the right of every tab's large title: an optional "?" that
// reopens that screen's feature guide, and the profile photo.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/I18nProvider';
import { ProfileButton } from '@/ui/ProfileButton';
import { useTheme } from '@/ui/ThemeProvider';

// onHelp: the screen has a feature guide; shows a small "?" that reopens it.
export function HeaderActions({ onHelp }: { onHelp?: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      {onHelp && (
        <Pressable
          onPress={onHelp}
          hitSlop={8}
          style={[styles.help, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('guide.helpA11y')}
        >
          <Text style={[styles.helpText, { color: colors.muted }]}>?</Text>
        </Pressable>
      )}
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  help: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  helpText: { fontSize: 16, fontWeight: '800' },
});
