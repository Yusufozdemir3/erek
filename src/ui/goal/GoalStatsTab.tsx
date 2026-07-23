// Hedef DETAY ekranının İSTATİSTİK sekmesi — app/goal/[id].tsx'ten AYRILDI.
// Ekran dosyası dört sekmeyi, form durumunu, mutasyonları ve bu görselleştirmeyi
// birlikte taşıyordu (~1080 satır); bu sekme salt-okunurdur (hiçbir mutasyon
// yapmaz, yalnız useGoalStats'in ürettiğini çizer), o yüzden ilk ayrılan o oldu.
//
// Bölüm sırası bilinçli: en üstte tek cümlelik SONUÇ bandı ("yetişecek miyim?"),
// altında bir bakışta durum, sonra "gereken tempo" ve "senin temponun" grupları
// yan yana okunacak şekilde, en altta sıradaki adım.

import { Text, View } from 'react-native';
import { diffDays } from '@/lib/helpers';
import { shortDate } from '@/ui/theme';
import { fmtGoalValue } from '@/ui/goal/goalFormat';
import { StatCard, StatGroupTitle } from '@/ui/goal/GoalStatCards';
import type { GoalStyles } from '@/ui/goal/goalStyles';
import type { Goal } from '@/db';
import type { GoalStats } from '@/ui/useGoalStats';

type Lang = 'tr' | 'en' | 'de';
type Translate = (key: string, params?: Record<string, string | number>) => string;

// İstatistik sekmesinin en üstündeki tek "sonuç" bandı — kullanıcının asıl
// merak ettiği "yetişecek miyim?" sorusunu 6 kutuyu birleştirmeden tek cümleyle
// yanıtlar. Yalnız sayısal hedefte ve tempo/son tarih verisi varken üretilir;
// yoksa null (bant gösterilmez). tone renk verir: good=yeşil, bad=kırmızı,
// neutral=vurgu.
type Verdict = { text: string; sub?: string; tone: 'good' | 'bad' | 'neutral' };
export function buildVerdict(
  goal: { goal_type: string; deadline: string | null; unit: string | null },
  stats: GoalStats,
  t: Translate,
  lang: Lang
): Verdict | null {
  if (goal.goal_type !== 'numeric') return null;
  if (stats.completed) return { text: t('goalStats.verdictDone'), tone: 'good' };

  // Gerçek tempodan tahmini bitiş var: son tarihle kıyasla.
  if (stats.projectedFinishDate) {
    const finish = shortDate(stats.projectedFinishDate, lang);
    if (goal.deadline) {
      const gap = diffDays(stats.projectedFinishDate, goal.deadline); // >0 = erken
      if (gap > 0) return { text: t('goalStats.verdictEarly', { date: finish, n: gap }), tone: 'good' };
      if (gap === 0) return { text: t('goalStats.verdictOnTime', { date: finish }), tone: 'good' };
      return {
        text: t('goalStats.verdictLate', { date: finish, n: -gap }),
        sub:
          stats.dailyPace != null
            ? t('goalStats.verdictFix', { amount: fmtGoalValue(stats.dailyPace, goal.unit) })
            : undefined,
        tone: 'bad',
      };
    }
    return { text: t('goalStats.verdictFinish', { date: finish }), tone: 'neutral' };
  }

  // Henüz girdi yok ama gereken tempo hesaplanabiliyor: yalnız gerekliliği söyle.
  if (stats.dailyPace != null && goal.deadline) {
    return {
      text: t('goalStats.verdictNeed', { amount: fmtGoalValue(stats.dailyPace, goal.unit) }),
      tone: 'neutral',
    };
  }
  return null;
}

export interface GoalStatsTabProps {
  goal: Goal;
  stats: GoalStats;
  t: Translate;
  lang: Lang;
  styles: GoalStyles;
}

export function GoalStatsTab({ goal, stats, t, lang, styles }: GoalStatsTabProps) {
  return (
      <View>
        {(() => {
          const verdict = buildVerdict(goal, stats, t, lang);
          return verdict ? (
            <View
              style={[
                styles.verdict,
                verdict.tone === 'good' && styles.verdictGood,
                verdict.tone === 'bad' && styles.verdictBad,
              ]}
            >
              <Text
                style={[
                  styles.verdictText,
                  verdict.tone === 'good' && styles.verdictTextGood,
                  verdict.tone === 'bad' && styles.verdictTextBad,
                ]}
              >
                {verdict.text}
              </Text>
              {verdict.sub && <Text style={styles.verdictSub}>{verdict.sub}</Text>}
            </View>
          ) : null;
        })()}

        {/* Üst satır — bir bakışta "neredeyim": ilerleme, kalan, son tarih, kalan gün */}
        <View style={styles.statsGrid}>
          {goal.goal_type === 'numeric' && (
            <>
              <StatCard label={t('goal.statRatio')} value={`%${Math.round(stats.ratio * 100)}`} styles={styles} />
              <StatCard
                label={t('goal.statRemaining')}
                value={stats.remaining != null ? fmtGoalValue(stats.remaining, goal.unit) : '–'}
                styles={styles}
              />
            </>
          )}
          <StatCard
            label={t('goal.statDeadline')}
            value={goal.deadline ? shortDate(goal.deadline, lang) : '–'}
            styles={styles}
          />
          {stats.isOverdue ? (
            <StatCard
              label={t('goalStats.overdueDaysLabel')}
              value={String(stats.overdueDays)}
              accent="danger"
              styles={styles}
            />
          ) : stats.daysLeft != null ? (
            <StatCard label={t('goalStats.daysLeftLabel')} value={String(stats.daysLeft)} styles={styles} />
          ) : null}
        </View>

        {/* Gereken tempo — app'in senden istediği (son tarihe yetişmek için) */}
        {goal.goal_type === 'numeric' && stats.dailyPace != null && (
          <>
            <StatGroupTitle label={t('goalStats.groupRequiredPace')} styles={styles} />
            <View style={styles.statsGrid}>
              <StatCard
                label={t('goalStats.dailyPaceLabel')}
                value={fmtGoalValue(stats.dailyPace, goal.unit)}
                accent="primary"
                styles={styles}
              />
              <StatCard
                label={t('goalStats.weeklyPaceLabel')}
                value={fmtGoalValue(stats.weeklyPace!, goal.unit)}
                styles={styles}
              />
            </View>
          </>
        )}

        {/* Senin temponun — gerçekte yaptığın; üstteki grupla kıyaslanır */}
        {goal.goal_type === 'numeric' && stats.avgDaily != null && (
          <>
            <StatGroupTitle label={t('goalStats.groupYourPace')} styles={styles} />
            <View style={styles.statsGrid}>
              <StatCard
                label={t('goalStats.avgDailyLabel')}
                value={fmtGoalValue(stats.avgDaily, goal.unit)}
                styles={styles}
              />
              {stats.last7Total != null && (
                <StatCard
                  label={t('goalStats.last7Label')}
                  value={fmtGoalValue(stats.last7Total, goal.unit)}
                  styles={styles}
                />
              )}
              {/* "Bu hızla hangi tarihte bitiririm" — bantta cümle olarak
                  da geçiyor ama kullanıcı bunu kart olarak da istedi
                  (bant tek bakışlık yorum, kart ölçüm). */}
              {stats.projectedFinishDate != null && (
                <StatCard
                  label={t('goalStats.projectedFinishLabel')}
                  value={shortDate(stats.projectedFinishDate, lang)}
                  styles={styles}
                />
              )}
              {/* "Bu hızla seçilen son tarihte miktar ne olur" — son tarih
                  geçtiyse tahmin değil GERÇEKLEŞEN değer (goalProjection). */}
              {stats.projectedAtDeadline != null && (
                <StatCard
                  label={t('goalStats.projectedAtDeadlineLabel')}
                  value={fmtGoalValue(stats.projectedAtDeadline, goal.unit)}
                  styles={styles}
                />
              )}
              {stats.behindAmount != null && Math.abs(stats.behindAmount) >= 0.05 && (
                <StatCard
                  label={t(stats.behindAmount > 0 ? 'goalStats.behindLabel' : 'goalStats.aheadLabel')}
                  value={fmtGoalValue(Math.abs(stats.behindAmount), goal.unit)}
                  accent={stats.behindAmount > 0 ? 'danger' : undefined}
                  styles={styles}
                />
              )}
              {stats.daysElapsed != null && (
                <StatCard
                  label={t('goalStats.daysElapsedLabel')}
                  value={String(stats.daysElapsed)}
                  styles={styles}
                />
              )}
            </View>
          </>
        )}

        {/* SIRADAKİ ADIM — adımı olan HER hedefte görünür, tipe
            bakılmaksızın. Toplu tempo (gün/adım, adım/hafta) bilerek
            KALDIRILDI: kullanıcının sorusu "toplamda kaç adım kaldı"
            değil, "şimdi neye çalışıyorum ve yetişiyor muyum".
            Miktarsız (checklist) adımda hedef/kalan kartları çıkmaz —
            o adımın sayısal bir eşiği yoktur. */}
        {stats.milestonesTotal > 0 && (
          <>
            <StatGroupTitle label={t('goalStats.groupMilestones')} styles={styles} />
            {stats.nextMilestone ? (
              <>
                <Text style={styles.nextMilestoneTitle} numberOfLines={2}>
                  {stats.nextMilestone.title}
                </Text>
                <View style={styles.statsGrid}>
                  <StatCard
                    label={t('goalStats.nextMilestoneRatioLabel')}
                    value={`%${Math.round(stats.nextMilestone.ratio * 100)}`}
                    accent="primary"
                    styles={styles}
                  />
                  {stats.nextMilestone.targetAmount != null && (
                    <StatCard
                      label={t('goalStats.nextMilestoneTargetLabel')}
                      value={fmtGoalValue(stats.nextMilestone.targetAmount, goal.unit)}
                      styles={styles}
                    />
                  )}
                  {stats.nextMilestone.remainingAmount != null && (
                    <StatCard
                      label={t('goalStats.nextMilestoneRemainingLabel')}
                      value={fmtGoalValue(stats.nextMilestone.remainingAmount, goal.unit)}
                      styles={styles}
                    />
                  )}
                  {stats.nextMilestone.isOverdue ? (
                    <StatCard
                      label={t('goalStats.nextMilestoneOverdueLabel')}
                      value={String(stats.nextMilestone.overdueDays)}
                      accent="danger"
                      styles={styles}
                    />
                  ) : stats.nextMilestone.daysLeft != null ? (
                    <StatCard
                      label={t('goalStats.nextMilestoneDaysLeftLabel')}
                      value={String(stats.nextMilestone.daysLeft)}
                      styles={styles}
                    />
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={styles.paceHint}>{t('goalStats.allMilestonesDone')}</Text>
            )}
          </>
        )}

        {!goal.deadline && <Text style={styles.paceHint}>{t('goalStats.noDeadline')}</Text>}
      </View>
  );
}
