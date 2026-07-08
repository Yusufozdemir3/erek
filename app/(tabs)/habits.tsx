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
import { useAppData } from '@/ui/AppData';
import { useHabitsData, type HabitListItem } from '@/ui/useHabitsData';
import { EmptyState } from '@/ui/EmptyState';
import { HabitEditModal } from '@/ui/HabitEditModal';
import { HabitToggle } from '@/ui/HabitToggle';
import { HabitTimer } from '@/ui/HabitTimer';
import { AmountStepper } from '@/ui/AmountStepper';
import { ProfileButton } from '@/ui/ProfileButton';
import { colors, shared } from '@/ui/theme';

export default function HabitsScreen() {
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
          <Text style={shared.greeting}>Alışkanlıklar</Text>
          <ProfileButton />
        </View>
        <Text style={shared.subtitle}>Her gün küçük bir adım</Text>

        {habits.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title="Henüz alışkanlık yok"
            subtitle="Alttaki ＋ ile küçük bir tane ekle — her gün bir adım."
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
                  <Pressable onPress={() => toggleToday(h)} hitSlop={8}>
                    <HabitToggle icon={h.icon} color={h.color} completed={h.completedToday} />
                  </Pressable>
                )}
                {/* Başlığa dokununca düzenleme paneli açılır */}
                <Pressable style={styles.titleArea} onPress={() => openEdit(h)}>
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
                  <HabitTimer habitId={h.id} amount={h.amount} target={h.target ?? 0} editable />
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
                  h.streak > 0 && <Text style={shared.streak}>🔥 {h.streak}</Text>
                )}
              </View>
              {/* Son 7 gün — dokununca istatistik ekranı açılır */}
              <Pressable
                style={styles.week}
                onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
                hitSlop={6}
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

const styles = StyleSheet.create({
  habitCard: { flexDirection: 'column', alignItems: 'stretch' },
  habitTop: { flexDirection: 'row', alignItems: 'center' },
  titleArea: { flex: 1 },
  remind: { fontSize: 12, color: '#64748b', marginTop: 2 },
  week: { flexDirection: 'row', gap: 6, marginTop: 12, marginLeft: 42 },
  dayDot: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayDotOn: { backgroundColor: colors.done, borderColor: colors.done },
});
