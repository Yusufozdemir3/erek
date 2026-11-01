// "Shared with you" lists under the Habits and Goals tabs: read-only rows, tap to
// open, swipe left (or long-press) to remove. Cache first, then the server; offline keeps the
// last list. Nothing shows when signed out.

import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  getCachedSharedGoals,
  getCachedSharedHabits,
  getSharedGoals,
  getSharedHabits,
  sharingErrorKey,
  unshareGoal,
  unshareHabit,
  type SharedGoal,
  type SharedHabit,
} from '@/sync';
import { goalRepo } from '@/db';
import { ACCOUNTS_ENABLED } from '@/config';
import { useAppData } from '@/ui/AppData';
import { useHabitGroups } from '@/ui/useHabitGroups';
import { JoinGroupButton } from '@/ui/habit/JoinGroupButton';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { SwipeableRow } from '@/ui/SwipeableRow';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DEFAULT_HABIT_COLOR, percentLabel, type Colors } from '@/ui/theme';

// `enabled` is false when signed out.
function useSharedList<T>(enabled: boolean, getCached: () => Promise<T[]>, getFresh: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const mine = ++seq.current;
    if (!enabled) {
      setItems([]);
      return;
    }
    let fresh = false;
    getCached().then((cached) => {
      if (mine === seq.current && !fresh && cached.length > 0) setItems(cached);
    });
    getFresh()
      .then((list) => {
        fresh = true;
        if (mine === seq.current) setItems(list);
      })
      .catch(() => {
        // Offline / server hiccup: keep showing the cached list.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useFocusEffect(reload);
  return { items, setItems, reload };
}

export function useSharedLists() {
  const { authUser } = useAppData();
  const { t } = useI18n();
  const signedIn = ACCOUNTS_ENABLED && authUser != null && !authUser.isAnonymous;
  const habits = useSharedList<SharedHabit>(signedIn, getCachedSharedHabits, getSharedHabits);
  const goals = useSharedList<SharedGoal>(signedIn, getCachedSharedGoals, getSharedGoals);

  const confirmHide = (title: string, ownerName: string | null, run: () => Promise<void>) => {
    const name = ownerName ?? t('friends.unknownName');
    Alert.alert(t('friends.hideSharedTitle'), t('friends.hideSharedBody', { title, name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('friends.remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await run();
          } catch (e) {
            Alert.alert(t('friends.errorTitle'), t(sharingErrorKey(e)));
          }
        },
      },
    ]);
  };

  // A habit we joined is ours now (a copy in our own list); its original isn't listed again.
  const { groups } = useHabitGroups();
  const joined = new Set(groups.filter((g) => g.members.some((m) => m.isMe && !m.isOwner)).map((g) => g.groupId));

  return {
    sharedHabits: habits.items.filter((s) => !joined.has(s.habit.id)),
    sharedGoals: goals.items,
    reload: useCallback(() => {
      habits.reload();
      goals.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [habits.reload, goals.reload]),
    hideHabit: (s: SharedHabit) =>
      confirmHide(s.habit.title, s.owner.displayName, async () => {
        await unshareHabit(s.habit.id, s.owner.id);
        habits.setItems((prev) => prev.filter((x) => x.habit.id !== s.habit.id));
      }),
    hideGoal: (s: SharedGoal) =>
      confirmHide(s.goal.title, s.owner.displayName, async () => {
        await unshareGoal(s.goal.id, s.owner.id);
        goals.setItems((prev) => prev.filter((x) => x.goal.id !== s.goal.id));
      }),
  };
}

// Remove only (it's not mine to edit); onHide asks itself, so no second tap.
function SharedRow({
  id,
  title,
  openId,
  setOpenId,
  onHide,
  children,
}: {
  id: string;
  title: string;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onHide: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <View style={{ marginBottom: 8 }}>
      <SwipeableRow
        isOpen={openId === id}
        onOpenChange={(open) => setOpenId(open ? id : null)}
        onDelete={onHide}
        confirmDelete={false}
        deleteA11yLabel={t('friends.hideSharedA11y', { title })}
      >
        {children}
      </SwipeableRow>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function SharedHabitsSection({
  items,
  onHide,
}: {
  items: SharedHabit[];
  onHide: (s: SharedHabit) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <Section title={t('friends.sharedSectionTitle')}>
      {items.map((s) => {
        const color = s.habit.color ?? DEFAULT_HABIT_COLOR;
        return (
          <SharedRow
            key={s.habit.id}
            id={s.habit.id}
            title={s.habit.title}
            openId={openId}
            setOpenId={setOpenId}
            onHide={() => onHide(s)}
          >
          <View style={styles.habitCard}>
          <Pressable
            style={styles.habitRow}
            onPress={() => router.push({ pathname: '/shared-habit/[id]', params: { id: s.habit.id } })}
            onLongPress={() => onHide(s)}
            accessibilityRole="button"
            accessibilityHint={t('friends.hideSharedHint')}
          >
            <View style={[styles.icon, { borderColor: color }]}>
              <HabitIconGlyph id={s.habit.icon} size={15} color={color} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {s.habit.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {s.owner.displayName ?? t('friends.unknownName')} · {t(s.together !== false ? 'group.inviteTag' : 'group.viewTag')}
              </Text>
            </View>
            {s.together === false && <Feather name="eye" size={16} color={colors.faint} />}
            <Feather name="chevron-right" size={18} color={colors.faint} />
          </Pressable>
          {s.together !== false && (
            <View style={styles.joinRow}>
              <Pressable style={styles.notNow} onPress={() => onHide(s)} accessibilityRole="button">
                <Text style={styles.notNowText}>{t('group.joinNotNow')}</Text>
              </Pressable>
              <JoinGroupButton habitId={s.habit.id} title={s.habit.title} compact />
            </View>
          )}
          </View>
          </SharedRow>
        );
      })}
    </Section>
  );
}

export function SharedGoalsSection({
  items,
  onHide,
}: {
  items: SharedGoal[];
  onHide: (s: SharedGoal) => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const [openId, setOpenId] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <Section title={t('friends.sharedSectionTitle')}>
      {items.map((s) => {
        const g = s.goal;
        const pct = Math.round(goalRepo.progressRatio(g) * 100);
        return (
          <SharedRow
            key={g.id}
            id={g.id}
            title={g.title}
            openId={openId}
            setOpenId={setOpenId}
            onHide={() => onHide(s)}
          >
          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: '/shared-goal/[id]', params: { id: g.id } })}
            onLongPress={() => onHide(s)}
            accessibilityRole="button"
            accessibilityHint={t('friends.hideSharedHint')}
          >
            <View style={[styles.icon, { borderColor: colors.primary }]}>
              <Feather name="target" size={15} color={colors.primary} />
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {g.title}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {t('friends.sharedBy', { name: s.owner.displayName ?? t('friends.unknownName') })}
                {g.goal_type === 'numeric' && g.target_value
                  ? ` · ${fmtGoalValue(g.current_value, g.unit)} / ${fmtGoalValue(g.target_value, g.unit)} (${percentLabel(pct, lang)})`
                  : ''}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.faint} />
          </Pressable>
          </SharedRow>
        );
      })}
    </Section>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.muted, marginBottom: 8, paddingHorizontal: 4 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    habitCard: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 10,
    },
    habitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    joinRow: { flexDirection: 'row', gap: 10 },
    notNow: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.line,
    },
    notNowText: { fontSize: 14, fontWeight: '600', color: c.text },
    icon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1 },
    title: { fontSize: 15, fontWeight: '600', color: c.text },
    sub: { fontSize: 12, color: c.muted, marginTop: 2 },
  });
