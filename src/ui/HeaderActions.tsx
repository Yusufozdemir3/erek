// The buttons on the right of every tab's large title: an optional help icon
// that reopens that screen's feature guide, and the profile photo.

import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { ProfileButton } from '@/ui/ProfileButton';
import { useTheme } from '@/ui/ThemeProvider';

// onHelp: the screen has a feature guide; shows a small help icon that reopens it.
export function HeaderActions({ onHelp }: { onHelp?: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      {onHelp && (
        <Pressable
          onPress={onHelp}
          hitSlop={8}
          style={styles.help}
          accessibilityRole="button"
          accessibilityLabel={t('guide.helpA11y')}
        >
          <Feather name="help-circle" size={26} color={colors.muted} />
        </Pressable>
      )}
      <ProfileButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  help: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
