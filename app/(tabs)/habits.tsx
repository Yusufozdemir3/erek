// "Alışkanlıklar" sekmesi — tüm alışkanlıklar, bugünkü işaret, seri ve son 7 günün
// geçmişi. Kutuya dokununca bugünü işaretler/geri alır.
// Ekleme burada yok: sekme çubuğundaki ＋ menüsünden yapılır.
// Mimari kural: SQL yok; yalnızca habitRepo çağrılır.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { notifySuccess, tapLight } from '@/lib/haptics';
import { highestMilestone } from '@/lib/milestones';
import { useAppData } from '@/ui/AppData';
import { useHabitsData, type HabitListItem } from '@/ui/useHabitsData';
import { EmptyState } from '@/ui/EmptyState';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { ProfileButton } from '@/ui/ProfileButton';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { type Colors } from '@/ui/theme';

export default function HabitsScreen() {
  const { colors, shared } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user } = useAppData();
  const [editing, setEditing] = useState<Habit | null>(null); // null = panel kapalı

  const { today, habits, reload } = useHabitsData(user.id);

  const toggleToday = (h: HabitListItem) => {
    const completing = !h.completedToday;
    habitRepo.toggleLog(h.id, today, completing);
    completing ? notifySuccess() : tapLight();
    reload();
  };

  const adjustToday = (h: HabitListItem, delta: number) => {
    habitRepo.incrementAmount(h.id, today, delta, h.target);
    tapLight();
    reload();
  };

  const setTodayAmount = (h: HabitListItem, value: number) => {
    habitRepo.incrementAmount(h.id, today, value - h.amount, h.target);
    reload();
  };

  const openEdit = (h: HabitListItem) => {
    setEditing(habitRepo.getById(h.id));
  };

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={shared.headerRow}>
          <Text style={shared.greeting}>{t('tabs.habits')}</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>{t('screen.habitsSubtitle')}</Text>

        {habits.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title={t('empty.habitsTitle')}
            subtitle={t('empty.habitsBody')}
          />
        ) : (
          habits.map((h, i) => (
            <View key={h.id} style={[shared.card, styles.habitCard, i === 0 && { marginTop: 20 }]}>
              <View style={styles.habitTop}>
                {/* Nicel alışkanlıkta daire yalnızca durum gösterir (dokunmaz);
                    ikili alışkanlıkta daireye dokununca bugünü işaretler. */}
                {h.target != null ? (
                  <HabitToggle icon={h.icon} color={h.color} completed={h.completedToday} />
                ) : (
                  <Pressable
                    onPress={() => toggleToday(h)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: h.completedToday }}
                    accessibilityLabel={t('habit.todayA11y', { title: h.title })}
                  >
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completedToday} />
                  </Pressable>
                )}
                {/* Başlığa dokununca düzenleme paneli açılır */}
                <Pressable
                  style={styles.titleArea}
                  onPress={() => openEdit(h)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.editA11y', { title: h.title })}
                >
                  <Text style={[shared.cardTitle, h.completedToday && shared.cardTitleDone]}>
                    {h.title}
                  </Text>
                  {(h.days || h.remindAt || h.period || h.goalTitle) && (
                    <Text style={styles.remind}>
                      {[
                        h.days,
                        h.period,
                        h.remindAt ? `🔔 ${h.remindAt}` : null,
                        h.goalTitle ? `🎯 ${h.goalTitle}` : null,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </Text>
                  )}
                </Pressable>
                {h.kind === 'timer' ? (
                  <HabitTimer
                    habitId={h.id}
                    amount={h.amount}
                    target={h.target ?? 0}
                    editable
                    onSet={(v) => setTodayAmount(h, v)}
                  />
                ) : h.target != null ? (
                  <AmountStepper
                    amount={h.amount}
                    target={h.target}
                    unit={h.unit}
                    onDec={() => adjustToday(h, -1)}
                    onInc={() => adjustToday(h, 1)}
                    onSet={(v) => setTodayAmount(h, v)}
                  />
                ) : (
                  h.streak > 0 && (
                    <Text style={shared.streak}>
                      {highestMilestone(h.streak)?.emoji ?? '🔥'} {h.streak}
                    </Text>
                  )
                )}
              </View>
              {/* Son 7 gün — dokununca istatistik ekranı açılır */}
              <Pressable
                style={styles.week}
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('habit.statsA11y', { title: h.title })}
              >
                {h.week.map((on, i) => (
                  <View key={i} style={[styles.dayDot, on && styles.dayDotOn]} />
                ))}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <HabitEditModal
        habit={editing}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    habitCard: { flexDirection: 'column', alignItems: 'stretch' },
    habitTop: { flexDirection: 'row', alignItems: 'center' },
    titleArea: { flex: 1 },
    remind: { fontSize: 12, color: c.muted, marginTop: 2 },
    week: { flexDirection: 'row', gap: 6, marginTop: 12, marginLeft: 42 },
    dayDot: {
      width: 16,
      height: 16,
      borderRadius: 4,
      backgroundColor: c.track,
      borderWidth: 1,
      borderColor: c.border,
    },
    dayDotOn: { backgroundColor: c.done, borderColor: c.done },
  });
