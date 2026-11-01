// "Shared habit" card on one of our habit's stats screen, when it belongs to a
// group (src/sync/habitGroups.ts): who's in, who has marked today, the shared
// streak, and leaving (a member) or ending the group (the founder).

import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { leaveHabitGroup, sharingErrorKey } from '@/sync';
import { groupDayStatus, groupOfHabit, groupStartYmd, sharedStreak, type MemberDayState } from '@/lib/habitGroup';
import { shiftYmd, todayDate } from '@/lib/helpers';
import { tapLight } from '@/lib/haptics';
import { Feather } from '@expo/vector-icons';
import { initialOf, memberName } from '@/ui/habit/GroupStrip';
import { GroupNudgeButton } from '@/ui/habit/GroupNudgeButton';
import { refreshGroups, useHabitGroups } from '@/ui/useHabitGroups';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/translations';
import { DATE_LOCALE, type Colors } from '@/ui/theme';

// Mon..Sun initials of a date, in the app's language.
const dayLabel = (ymd: string, lang: Lang) =>
  new Date(ymd + 'T00:00:00').toLocaleDateString(DATE_LOCALE[lang], { weekday: 'short' }).slice(0, 2);

const STATE_KEY: Record<MemberDayState, string> = {
  done: 'group.stateDone',
  waiting: 'group.stateWaiting',
  rest: 'group.stateRest',
};

export function HabitGroupSection({ habit }: { habit: Habit }) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const { groups, logs } = useHabitGroups();
  const [busy, setBusy] = useState(false);
  const group = groupOfHabit(groups, habit.id);
  if (!group) return null;

  const today = todayDate();
  const myDone = habitRepo.completedDatesBetween([habit.id], groupStartYmd(group), today)[habit.id] ?? new Set<string>();
  const status = groupDayStatus(group, logs, today, {
    done: myDone.has(today),
    resting: habit.skip_dates?.includes(today) ?? false,
  });
  const streak = sharedStreak(group, logs, habit, myDone, today);
  const me = group.members.find((m) => m.isMe);
  const owner = group.members.find((m) => m.isOwner);
  const iAmOwner = me?.isOwner === true;

  const leave = () => {
    tapLight();
    Alert.alert(
      t(iAmOwner ? 'group.endTitle' : 'group.leaveTitle'),
      t(iAmOwner ? 'group.endBody' : 'group.leaveBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t(iAmOwner ? 'group.end' : 'group.leave'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await leaveHabitGroup(habit.id);
              await refreshGroups(true);
            } catch (e) {
              Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  // The last 7 days: filled = everyone did it, faded with a number = some did.
  const week = Array.from({ length: 7 }, (_, i) => shiftYmd(today, i - 6)).map((date) => {
    const st = groupDayStatus(group, logs, date, {
      done: myDone.has(date),
      resting: habit.skip_dates?.includes(date) ?? false,
    });
    return { date, st };
  });

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View>
          <Text style={styles.title}>{t('group.title')}</Text>
          <Text style={styles.streakValue}>
            {streak} <Text style={styles.streakLabel}>{t('group.sharedStreak')}</Text>
          </Text>
        </View>
        <View style={styles.doneBadge}>
          <Text style={styles.doneBadgeText}>
            {status.done}/{status.total}
          </Text>
        </View>
      </View>

      <Text style={styles.subTitle}>{t('group.today')}</Text>
      {status.members.map(({ member, state }) => (
        <View key={member.id} style={styles.memberRow}>
          <View style={[styles.avatar, state === 'waiting' && styles.avatarWaiting]}>
            <Text style={styles.avatarText}>{initialOf(memberName(member, t))}</Text>
          </View>
          <Text style={styles.memberName} numberOfLines={1}>
            {memberName(member, t)}
            {member.isOwner ? ` · ${t('group.founder')}` : ''}
          </Text>
          {state === 'done' ? (
            <View style={styles.checkOn}>
              <Feather name="check" size={14} color={colors.onAccent} />
            </View>
          ) : (
            <>
              <Text style={styles.memberState}>{t(STATE_KEY[state])}</Text>
              {state === 'waiting' && !member.isMe && (
                <GroupNudgeButton habitId={member.habitId} name={memberName(member, t)} />
              )}
            </>
          )}
        </View>
      ))}

      <Text style={styles.subTitle}>{t('group.week')}</Text>
      <View style={styles.weekRow}>
        {week.map(({ date, st }) => {
          const full = st.allDone;
          const some = !full && st.done > 0;
          return (
            <View key={date} style={styles.weekCol}>
              <Text style={styles.weekDay}>{dayLabel(date, lang)}</Text>
              <View style={[styles.weekDot, some && styles.weekDotSome, full && styles.weekDotFull]}>
                {full ? (
                  <Feather name="check" size={14} color={colors.onAccent} />
                ) : some ? (
                  <Text style={styles.weekNum}>{st.done}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('group.weekHint')}</Text>

      {!iAmOwner && owner && (
        <Text style={styles.hint}>
          {t('group.rulesLocked', { name: owner.displayName ?? t('friends.unknownName') })}
        </Text>
      )}

      <Pressable
        onPress={leave}
        disabled={busy}
        style={[styles.leaveBtn, busy && styles.busy]}
        accessibilityRole="button"
      >
        <Text style={styles.leaveText}>{t(iAmOwner ? 'group.end' : 'group.leave')}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    card: {
      marginTop: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    title: { fontSize: 13, color: c.muted, fontWeight: '600' },
    hint: { fontSize: 12, color: c.faint, lineHeight: 17, marginTop: 6 },
    headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    streakValue: { fontSize: 24, fontWeight: '800', color: c.streak, marginTop: 4 },
    streakLabel: { fontSize: 13, color: c.muted, fontWeight: '600' },
    doneBadge: { backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
    doneBadgeText: { fontSize: 12, fontWeight: '700', color: c.primary },
    subTitle: { fontSize: 13, color: c.muted, fontWeight: '600', marginTop: 16 },
    memberRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 10 },
    avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    avatarWaiting: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line },
    avatarText: { fontSize: 11, fontWeight: '700', color: c.primary },
    memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    memberState: { fontSize: 13, color: c.muted },
    checkOn: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.done, alignItems: 'center', justifyContent: 'center' },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    weekCol: { alignItems: 'center', width: 36 },
    weekDay: { fontSize: 11, fontWeight: '600', color: c.faint },
    weekDot: { width: 30, height: 30, borderRadius: 15, marginTop: 4, backgroundColor: c.track, alignItems: 'center', justifyContent: 'center' },
    weekDotSome: { backgroundColor: c.done + '33' },
    weekDotFull: { backgroundColor: c.done },
    weekNum: { fontSize: 12, fontWeight: '700', color: c.text },
    leaveBtn: { marginTop: 16, alignSelf: 'flex-start' },
    leaveText: { fontSize: 14, fontWeight: '700', color: c.danger },
    busy: { opacity: 0.5 },
  });
