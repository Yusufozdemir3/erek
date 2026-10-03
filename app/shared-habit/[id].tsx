// A friend's habit, shared with you read-only: the same stats body as your own
// habits, but with no editing or check-off controls. Data is served from cache
// first and refreshed from the server (see src/ui/useSharedHabit.ts).

import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useSharedHabit } from '@/ui/useSharedHabit';
import { NudgeButton } from '@/ui/NudgeButton';
import { HabitStatsBody } from '@/ui/habit/HabitStatsBody';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { makeHabitStatsStyles } from '@/ui/habit/habitStatsStyles';

export default function SharedHabitScreen() {
  const { colors, shared: sharedStyles } = useTheme();
  const { t } = useI18n();
  const styles = makeHabitStatsStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shared, stats, calendar, status } = useSharedHabit(id);
  const habit = stats.habit;

  const subtitle = shared ? (
    <Text style={[styles.cardLabel, { marginTop: 4 }]}>
      {t('friends.sharedBy', { name: shared.owner.displayName ?? t('friends.unknownName') })}
      {' · '}
      {t('sharedHabit.readOnly')}
      {status === 'offline' ? ` · ${t('sharedHabit.offline')}` : ''}
    </Text>
  ) : null;

  return (
    <SafeAreaView style={sharedStyles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={sharedStyles.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {status === 'gone' ? (
          <Text style={sharedStyles.empty}>{t('sharedHabit.gone')}</Text>
        ) : !habit ? (
          <Text style={sharedStyles.empty}>
            {status === 'offline' ? t('friends.err.ERK_NETWORK') : t('sharedHabit.loading')}
          </Text>
        ) : (
          <>
            {shared && (
              <NudgeButton
                kind="habit"
                itemId={id}
                ownerName={shared.owner.displayName ?? t('friends.unknownName')}
                message={t('friends.nudgeHabitMessage', {
                  name: shared.owner.displayName ?? t('friends.unknownName'),
                  title: habit.title,
                })}
              />
            )}
            <HabitStatsBody stats={{ ...stats, habit }} calendar={calendar} subtitle={subtitle} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
