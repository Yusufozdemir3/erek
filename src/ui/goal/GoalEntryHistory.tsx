// A goal's entry history, shared by the owner's screen and the shared-goal
// screen. Same-minute taps by the same person are merged into one line, lines
// sit under day headers (Today / Yesterday / date), and days older than a week
// fold behind a button — see entryGroups.ts for the (display-only) rules.

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import {
  groupByDay,
  groupEntries,
  shiftDay,
  splitRecent,
  type DayGroup,
  type EntryLike,
} from '@/ui/goal/entryGroups';
import type { GoalStyles } from '@/ui/goal/goalStyles';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE } from '@/ui/theme';

interface Props {
  entries: EntryLike[]; // newest → oldest
  unit: string | null;
  today: string; // local "YYYY-MM-DD"
  styles: GoalStyles;
  // Who to show on a line (null = nothing). The owner's screen only names
  // friends' contributions; the shared screen names everyone.
  whoOf: (addedBy: string | null) => string | null;
}

export function GoalEntryHistory({ entries, unit, today, styles, whoOf }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const [showOlder, setShowOlder] = useState(false);
  if (entries.length === 0) return null;

  const { recent, older, olderEntryCount } = splitRecent(
    groupByDay(groupEntries(entries)),
    today
  );
  const locale = DATE_LOCALE[lang];
  const thisYear = today.slice(0, 4);

  const dayLabel = (day: string) => {
    if (day === today) return t('common.today');
    if (day === shiftDay(today, -1)) return t('common.yesterday');
    return new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      ...(day.slice(0, 4) === thisYear ? {} : { year: 'numeric' }),
    });
  };

  const renderDay = (d: DayGroup) => (
    <View key={d.day}>
      <Text style={styles.entryHistoryDayTitle}>{dayLabel(d.day)}</Text>
      {d.groups.map((g) => {
        const sign = g.amount > 0 ? '+' : g.amount < 0 ? '-' : '±';
        const who = whoOf(g.addedBy);
        const time = new Date(g.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        return (
          <View key={g.key} style={styles.entryHistoryRow}>
            <Text style={styles.entryHistoryAmountWrap}>
              <Text style={[styles.entryHistoryAmount, g.amount < 0 && styles.entryHistoryAmountNeg]}>
                {sign}
                {fmtGoalValue(Math.abs(g.amount), unit)}
              </Text>
              {g.count > 1 && (
                <Text style={styles.entryHistoryDate}>{`  ·  ${t('goal.entryCount', { n: g.count })}`}</Text>
              )}
            </Text>
            <View style={styles.entryHistoryWhen}>
              {who && <Feather name="users" size={11} color={colors.faint} />}
              <Text style={styles.entryHistoryDate}>{who ? `${who} · ${time}` : time}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.entryHistory}>
      <Text style={styles.entryHistoryTitle}>{t('goal.entryHistory')}</Text>
      {recent.map(renderDay)}
      {older.length > 0 &&
        (showOlder ? (
          older.map(renderDay)
        ) : (
          <Pressable
            style={styles.entryHistoryShowOlder}
            onPress={() => setShowOlder(true)}
            accessibilityRole="button"
            accessibilityLabel={t('goal.showOlderEntries', { n: olderEntryCount })}
          >
            <Text style={styles.entryHistoryShowOlderText}>
              {t('goal.showOlderEntries', { n: olderEntryCount })}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}
