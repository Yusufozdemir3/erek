// Alışkanlık istatistik ekranı — özet sayılar, Hedef/Puan/Geçmiş kartı,
// aylık takvim + en altta rozetler.
// "Alışkanlıklar" sekmesinde bir kartın haftalık geçmiş şeridine dokununca açılır.
// Mimari kural: SQL yok; yalnızca useHabitStats (habitRepo üzerinden) çağrılır.
//
// Bu dosya yalnız SAYFA İSKELETİ: veri yükleme, başlık, bölümlerin sırası.
// Bölümlerin kendisi src/ui/habit/HabitStatsSections.tsx'te, biçimlendiriciler
// habitStatsFormat.ts'te, stiller habitStatsStyles.ts'te (denetim bulgusu H1).

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { isQuotaSchedule } from '@/lib/helpers';
import { STREAK_MILESTONES } from '@/lib/milestones';
import { useHabitStats } from '@/ui/useHabitStats';
import { useHabitCalendar } from '@/ui/useHabitCalendar';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { DATE_LOCALE, DEFAULT_HABIT_COLOR } from '@/ui/theme';
import { makeHabitStatsStyles } from '@/ui/habit/habitStatsStyles';
import { HabitDarkStatsCard, MonthCalendar, StatCard } from '@/ui/habit/HabitStatsSections';

export default function HabitStatsScreen() {
  const { colors, shared } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeHabitStatsStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const stats = useHabitStats(id);
  const calendar = useHabitCalendar(id);
  const habitColor = stats.habit?.color ?? DEFAULT_HABIT_COLOR;
  // Kota (haftada X kez) alışkanlıkta seriler HAFTA bazındadır: etiket/birim
  // farklı, rozet eşikleri (gün cinsinden) hafta×7 ile karşılaştırılır.
  const isQuota = isQuotaSchedule(stats.habit?.schedule ?? null);
  const streakDays = isQuota ? stats.longestStreak * 7 : stats.longestStreak;
  // Kazanılan rozetler + sıradaki eşik. İlerleme 0'dan sıradaki eşiğe göre
  // ölçülür (bir önceki eşikten değil): "kalan gün" sayısıyla aynı doğrusal
  // ölçek, çubuk ile yazı birbirini doğruluyor.
  const earnedBadges = STREAK_MILESTONES.filter((m) => streakDays >= m.days);
  const nextBadge = STREAK_MILESTONES.find((m) => streakDays < m.days) ?? null;
  const badgePct = nextBadge ? Math.min(100, Math.round((streakDays / nextBadge.days) * 100)) : 100;
  const monthLabel = new Date(calendar.year, calendar.month, 1).toLocaleDateString(DATE_LOCALE[lang], {
    month: 'long',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={shared.safe} edges={['top']}>
      <ScrollView contentContainerStyle={shared.content}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backRow}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>

        {!stats.habit ? (
          <Text style={shared.empty}>{t('stats.notFound')}</Text>
        ) : (
          <>
            <View style={styles.headRow}>
              {stats.habit.icon && <HabitIconGlyph id={stats.habit.icon} size={26} color={habitColor} />}
              <Text style={shared.greeting}>{stats.habit.title}</Text>
            </View>

            <View style={styles.statsRow}>
              <StatCard
                label={t(isQuota ? 'stats.currentStreakWeeks' : 'stats.currentStreak')}
                value={`🔥 ${stats.currentStreak}`}
                styles={styles}
              />
              <StatCard
                label={t(isQuota ? 'stats.longestStreakWeeks' : 'stats.longestStreak')}
                value={String(stats.longestStreak)}
                styles={styles}
              />
              {/* "Tamamlanma %" KALDIRILDI: ömür boyu ortalama olduğu için
                  alışkanlık yaşlandıkça donuyordu (iyi de kötü de bir hafta
                  sayıyı kıpırdatmıyor) — Puan kartındaki EMA aynı soruya trendle
                  cevap veriyor, ikisi yan yana kafa karıştırıyordu. */}
            </View>

            {/* Hedef/Puan/Geçmiş — tek koyu kart (Claude Design mockup'ının portu, bkz. HabitDarkStatsCard). */}
            <View style={{ marginTop: 12 }}>
              <HabitDarkStatsCard
                stats={stats}
                habit={stats.habit}
                color={habitColor}
                themeColors={colors}
                lang={lang}
                t={t}
                styles={styles}
              />
            </View>

            {/* "Seri geçmişi" (en uzun 3 seri) KALDIRILDI: üstteki özet zaten
                güncel + en uzun seriyi veriyordu, bölüm yalnız 2. ve 3. en uzunu
                ekliyordu; hemen altındaki Takvim aynı geçmişi çok daha zengin
                gösteriyor. Kalan bölümler kendi `styles.card` kutusunda — ekrandaki
                istatistik blokları TUTARLI şekilde kutulu/ayrık. */}

            {/* Tam takvim — ay ay gezinilebilir. */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardLabel}>{t('stats.calendar')}</Text>
              <View style={[styles.calHead, { marginTop: 12 }]}>
                <Pressable
                  onPress={calendar.goPrev}
                  disabled={!calendar.canGoPrev}
                  hitSlop={8}
                  style={[styles.calNavBtn, !calendar.canGoPrev && styles.calNavBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('stats.prevMonthA11y')}
                >
                  <Feather name="chevron-left" size={18} color={calendar.canGoPrev ? colors.text : colors.faint} />
                </Pressable>
                <Text style={styles.calMonthLabel}>
                  {monthLabel.charAt(0).toLocaleUpperCase(DATE_LOCALE[lang]) + monthLabel.slice(1)}
                </Text>
                <Pressable
                  onPress={calendar.goNext}
                  disabled={!calendar.canGoNext}
                  hitSlop={8}
                  style={[styles.calNavBtn, !calendar.canGoNext && styles.calNavBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('stats.nextMonthA11y')}
                >
                  <Feather name="chevron-right" size={18} color={calendar.canGoNext ? colors.text : colors.faint} />
                </Pressable>
              </View>
              <View style={styles.calWeekHead}>
                {['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'].map(
                  (k) => (
                    <Text key={k} style={styles.calWeekHeadText}>
                      {t(k)}
                    </Text>
                  )
                )}
              </View>
              <MonthCalendar weeks={calendar.weeks} color={habitColor} styles={styles} />
            </View>

            {/* Rozetler — en uzun seri eşiği geçtiyse kazanılmış sayılır (seri
                düşse bile madalya kalır). Eskiden 4 eşiğin TAMAMI vitrindeydi,
                kilitliler soluk: içerik üstteki "En uzun seri" sayısından zaten
                türetilebiliyordu ve yeni kullanıcıyı 4 soluk madalya karşılıyordu.
                Artık yalnız kazanılanlar + SIRADAKİ eşik ilerleme çubuğuyla —
                mesaj "yapmadıkların"dan "az kaldı"ya döndü (aynı ekrandaki Hedef
                kartının dili). */}
            <View style={[styles.card, { marginTop: 12 }]}>
              <Text style={styles.cardLabel}>{t('stats.badges')}</Text>
              {earnedBadges.length > 0 && (
                <View style={[styles.badgeRow, { marginTop: 12 }]}>
                  {earnedBadges.map((m) => (
                    <View key={m.days} style={styles.badge}>
                      <Text style={styles.badgeEmoji}>{m.emoji}</Text>
                      <Text style={styles.badgeLabel}>{t(m.labelKey)}</Text>
                    </View>
                  ))}
                </View>
              )}
              {nextBadge ? (
                <View style={{ marginTop: 12 }}>
                  <View style={styles.badgeNextRow}>
                    <Text style={styles.badgeNextEmoji}>{nextBadge.emoji}</Text>
                    <Text style={styles.badgeNextLabel}>{t(nextBadge.labelKey)}</Text>
                    <Text style={styles.badgeNextLeft}>
                      {t('date.daysLeft', { n: nextBadge.days - streakDays })}
                    </Text>
                  </View>
                  <View style={styles.badgeTrack}>
                    <View style={[styles.badgeFill, { width: `${badgePct}%`, backgroundColor: habitColor }]} />
                  </View>
                </View>
              ) : (
                <Text style={[styles.badgeAllEarned, { marginTop: 12 }]}>{t('stats.badgesAllEarned')}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
