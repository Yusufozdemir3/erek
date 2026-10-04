// Weekly review (modal from Profile, or from Today's Sunday/Monday card): how
// the last 7 days went — completion rate, the trend against the week before,
// a bar per day, and which habit held up best / needs attention. All of it
// computed on the phone from existing data (lib/weeklyReview.ts).

import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/i18n/I18nProvider';
import { todayDate } from '@/lib/helpers';
import { messageKey, type Review } from '@/lib/weeklyReview';
import { useAppData } from '@/ui/AppData';
import { makeProfileStyles } from '@/ui/profileStyles';
import { loadReview } from '@/ui/reviewData';
import { useTheme } from '@/ui/ThemeProvider';
import { DATE_LOCALE, type Colors } from '@/ui/theme';

const BAR_MAX_HEIGHT = 72;

export default function ReviewScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeProfileStyles(colors);
  const local = makeStyles(colors);
  const { user, dataVersion } = useAppData();
  const [review, setReview] = useState<Review | null>(null);
  const today = todayDate();

  useFocusEffect(
    useCallback(() => {
      setReview(loadReview(user.id, today));
    }, [user.id, today, dataVersion])
  );

  if (!review) return <View style={styles.screen} />;

  if (review.rate === null) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={local.empty}>{t('review.empty')}</Text>
        </View>
      </ScrollView>
    );
  }

  const weekday = (ymd: string) =>
    new Date(`${ymd}T00:00:00`)
      .toLocaleDateString(DATE_LOCALE[lang], { weekday: 'narrow' })
      .toLocaleUpperCase(DATE_LOCALE[lang]);

  const delta =
    review.delta === null
      ? null
      : review.delta === 0
        ? t('review.deltaSame')
        : t(review.delta > 0 ? 'review.deltaUp' : 'review.deltaDown', { n: Math.abs(review.delta) });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={local.caption}>
          {t('review.rate')} · {t('review.subtitle')}
        </Text>
        <Text style={local.rate} accessibilityLabel={`${t('review.rate')}: ${review.rate}%`}>
          %{review.rate}
        </Text>
        {delta && (
          <View style={local.deltaRow}>
            <Feather
              name={review.delta! > 0 ? 'trending-up' : review.delta! < 0 ? 'trending-down' : 'minus'}
              size={16}
              color={review.delta! < 0 ? colors.muted : colors.done}
            />
            <Text style={local.delta}>{delta}</Text>
          </View>
        )}
        <Text style={local.message}>{t(messageKey(review.rate))}</Text>

        <View style={local.bars}>
          {review.days.map((d) => {
            const ratio = d.scheduled === 0 ? 0 : d.done / d.scheduled;
            const isToday = d.date === today;
            return (
              <View key={d.date} style={local.barCol} accessible accessibilityLabel={`${d.date}: ${d.done}/${d.scheduled}`}>
                <View style={local.barTrack}>
                  {d.scheduled > 0 && (
                    <View
                      style={[
                        local.barFill,
                        { height: Math.max(4, Math.round(ratio * BAR_MAX_HEIGHT)) },
                        ratio === 1 && { backgroundColor: colors.done },
                      ]}
                    />
                  )}
                </View>
                <Text style={[local.barLabel, isToday && local.barLabelToday]}>{weekday(d.date)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={[local.chips, { marginTop: 12 }]}>
        <View style={[styles.card, local.chip]}>
          <Text style={local.chipNumber}>{review.perfectDays}/7</Text>
          <Text style={local.chipLabel}>{t('review.perfectDays')}</Text>
        </View>
        <View style={[styles.card, local.chip]}>
          <Text style={local.chipNumber}>{review.tasksDone}</Text>
          <Text style={local.chipLabel}>{t('review.tasksLabel', { n: review.tasksDone })}</Text>
        </View>
      </View>

      {review.best && (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={local.caption}>{t('review.best')}</Text>
          <Text style={local.habitName}>{review.best.title}</Text>
          <Text style={local.habitMeta}>{t('review.fraction', { done: review.best.done, expected: review.best.expected })}</Text>
        </View>
      )}
      {review.needsAttention && (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={local.caption}>{t('review.attention')}</Text>
          <Text style={local.habitName}>{review.needsAttention.title}</Text>
          <Text style={local.habitMeta}>
            {t('review.fraction', { done: review.needsAttention.done, expected: review.needsAttention.expected })}
          </Text>
        </View>
      )}
      {review.habits.length > 1 && (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={local.caption}>{t('review.allHabits')}</Text>
          {review.habits.map((h) => (
            <View key={h.id} style={local.habitRow}>
              <Text style={local.habitRowName} numberOfLines={1}>
                {h.title}
              </Text>
              <View style={local.miniTrack}>
                <View style={[local.miniFill, { width: `${h.rate}%` }, h.rate === 100 && { backgroundColor: colors.done }]} />
              </View>
              <Text style={local.habitRowRate}>{h.done}/{h.expected}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    empty: { fontSize: 14, lineHeight: 21, color: c.muted },
    caption: { fontSize: 12, fontWeight: '700', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    rate: { fontSize: 48, fontWeight: '800', color: c.text, marginTop: 4 },
    deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    delta: { fontSize: 14, color: c.muted },
    message: { fontSize: 15, fontWeight: '600', color: c.text, marginTop: 12 },
    bars: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
    barCol: { alignItems: 'center', flex: 1 },
    barTrack: { height: BAR_MAX_HEIGHT, width: 14, borderRadius: 7, backgroundColor: c.track, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: 14, borderRadius: 7, backgroundColor: c.primary },
    barLabel: { fontSize: 12, color: c.faint, marginTop: 6 },
    barLabelToday: { color: c.text, fontWeight: '800' },
    chips: { flexDirection: 'row', gap: 12 },
    chip: { flex: 1, alignItems: 'center' },
    chipNumber: { fontSize: 24, fontWeight: '800', color: c.text },
    chipLabel: { fontSize: 12, color: c.muted, marginTop: 2, textAlign: 'center' },
    habitName: { fontSize: 17, fontWeight: '700', color: c.text, marginTop: 6 },
    habitMeta: { fontSize: 13, color: c.muted, marginTop: 2 },
    habitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
    habitRowName: { flex: 1.4, fontSize: 14, color: c.text },
    miniTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden' },
    miniFill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
    habitRowRate: { width: 36, textAlign: 'right', fontSize: 12, fontWeight: '700', color: c.muted },
  });
