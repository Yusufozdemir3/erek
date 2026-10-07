// Erek Plus — the paywall. Plus lifts every free-tier limit and removes ads; a
// separate one-time "ads-free" purchase only removes ads. Prices, trial and
// renewal come from Google Play via RevenueCat — the app never invents a price.
//
// Without RevenueCat (dev builds, Expo Go) the screen still opens and says
// purchases are unavailable; nothing breaks.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PRIVACY_POLICY_URL } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { annualSavingsPercent, INTRO_MS } from '@/plus/plusLogic';
import { applyCustomerInfo, usePlusState } from '@/plus/plusStore';
import { buyPlan, fetchPlans, restorePurchases, type Plan } from '@/plus/purchases';
import { useTheme } from '@/ui/ThemeProvider';
import type { Colors } from '@/ui/theme';

const MANAGE_URL = 'https://play.google.com/store/account/subscriptions?package=com.erek';
const PLAY_TERMS_URL = 'https://play.google.com/about/play-terms/';
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFITS: { icon: React.ComponentProps<typeof Feather>['name']; key: string }[] = [
  { icon: 'eye-off', key: 'plus.benefitAds' },
  { icon: 'bar-chart-2', key: 'plus.benefitHistory' },
  { icon: 'bell', key: 'plus.benefitReminders' },
  { icon: 'users', key: 'plus.benefitFriends' },
  { icon: 'layout', key: 'plus.benefitWidgets' },
  { icon: 'droplet', key: 'plus.benefitLooks' },
];

export default function PlusScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const plus = usePlusState();

  const [plans, setPlans] = useState<Plan[] | null>(null); // null = still loading
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPlans().then((list) => {
      if (!alive) return;
      setPlans(list);
      // The yearly plan is preselected (the better deal); else the first subscription.
      const subs = list.filter((p) => p.kind === 'monthly' || p.kind === 'annual');
      setSelected((subs.find((p) => p.kind === 'annual') ?? subs[0])?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const subs = useMemo(() => (plans ?? []).filter((p) => p.kind === 'monthly' || p.kind === 'annual'), [plans]);
  const adsFreePlan = useMemo(() => (plans ?? []).find((p) => p.kind === 'adsfree') ?? null, [plans]);
  const plan = subs.find((p) => p.id === selected) ?? null;
  const savings = useMemo(() => {
    const monthly = subs.find((p) => p.kind === 'monthly');
    const annual = subs.find((p) => p.kind === 'annual');
    return monthly && annual ? annualSavingsPercent(monthly.price, annual.price) : null;
  }, [subs]);

  const introDaysLeft =
    plus.billing && !plus.plus && plus.introEndsAt !== null && plus.introEndsAt > Date.now()
      ? Math.min(Math.ceil((plus.introEndsAt - Date.now()) / DAY_MS), INTRO_MS / DAY_MS)
      : null;

  const buy = async (p: Plan | null) => {
    if (!p || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await buyPlan(p);
    setBusy(false);
    if (result.status === 'success') {
      applyCustomerInfo(result.info);
      setMessage(t('plus.thanks'));
    } else if (result.status === 'error') {
      setMessage(t('plus.error'));
    }
    // 'cancelled': the user backed out — nothing to say.
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await restorePurchases();
    setBusy(false);
    if (result.status !== 'success') {
      setMessage(t('plus.error'));
      return;
    }
    applyCustomerInfo(result.info);
    const any = result.info.entitlements.active.plus || result.info.entitlements.active.ads_free;
    setMessage(any ? t('plus.restored') : t('plus.nothingToRestore'));
  };

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.badge}>
        <Feather name="star" size={36} color={colors.primary} />
      </View>
      <Text style={styles.headline} accessibilityRole="header">
        {t('plus.headline')}
      </Text>
      <Text style={styles.sub}>{t('plus.sub')}</Text>

      <View style={styles.card}>
        {BENEFITS.map((b) => (
          <View key={b.key} style={styles.benefit}>
            <Feather name={b.icon} size={20} color={colors.primary} />
            <Text style={styles.benefitText}>{t(b.key)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.freeNote}>{t('plus.freeNote')}</Text>

      {introDaysLeft !== null && <Text style={styles.intro}>{t('plus.introBody', { n: introDaysLeft })}</Text>}

      {plus.plus ? (
        <View style={[styles.card, styles.activeCard]}>
          <Text style={styles.activeTitle}>{t('plus.activeTitle')}</Text>
          <Text style={styles.activeBody}>{t('plus.activeBody')}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => open(MANAGE_URL)} accessibilityRole="button">
            <Text style={styles.secondaryText}>{t('plus.manage')}</Text>
          </Pressable>
        </View>
      ) : plans === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
      ) : subs.length === 0 && !adsFreePlan ? (
        <Text style={styles.unavailable}>{t('plus.unavailable')}</Text>
      ) : (
        <>
          <View style={{ gap: 10, marginTop: 8 }}>
            {subs.map((p) => {
              const on = p.id === selected;
              const title = p.kind === 'monthly' ? t('plus.monthly') : t('plus.annual');
              return (
                <Pressable
                  key={p.id}
                  style={[styles.plan, on && styles.planOn]}
                  onPress={() => setSelected(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${title}, ${p.priceString}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle}>{title}</Text>
                    {p.trialDays !== null && <Text style={styles.planTrial}>{t('plus.trial', { n: p.trialDays })}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.planPrice}>{p.priceString}</Text>
                    {p.kind === 'annual' && savings !== null && (
                      <Text style={styles.planSave}>{t('plus.save', { n: savings })}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {subs.length > 0 && (
            <Pressable
              style={[styles.cta, (busy || !plan) && { opacity: 0.6 }]}
              onPress={() => buy(plan)}
              disabled={busy || !plan}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.ctaText}>
                  {plan?.trialDays != null ? t('plus.ctaTrial', { n: plan.trialDays }) : t('plus.cta')}
                </Text>
              )}
            </Pressable>
          )}

          {adsFreePlan && !plus.adsFree && (
            <Pressable
              style={[styles.plan, { marginTop: 18 }]}
              onPress={() => buy(adsFreePlan)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${t('plus.adsFreeTitle')}, ${adsFreePlan.priceString}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>{t('plus.adsFreeTitle')}</Text>
                <Text style={styles.adsFreeBody}>{t('plus.adsFreeBody')}</Text>
              </View>
              <Text style={styles.planPrice}>{adsFreePlan.priceString}</Text>
            </Pressable>
          )}
        </>
      )}

      {plus.adsFree && !plus.plus && (
        <View style={[styles.card, styles.activeCard, { marginTop: 14 }]}>
          <Text style={styles.activeTitle}>{t('plus.adsFreeActiveTitle')}</Text>
          <Text style={styles.activeBody}>{t('plus.adsFreeActiveBody')}</Text>
        </View>
      )}

      {message && (
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}

      {!plus.plus && (
        <Pressable onPress={restore} disabled={busy} accessibilityRole="button" style={styles.restore}>
          <Text style={styles.restoreText}>{t('plus.restore')}</Text>
        </Pressable>
      )}

      <Text style={styles.fineprint}>{t('plus.fineprint')}</Text>
      <View style={styles.links}>
        <Pressable onPress={() => open(PRIVACY_POLICY_URL)} accessibilityRole="link">
          <Text style={styles.link}>{t('plus.privacyLink')}</Text>
        </Pressable>
        <Pressable onPress={() => open(PLAY_TERMS_URL)} accessibilityRole="link">
          <Text style={styles.link}>{t('plus.termsLink')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 40 },
    badge: {
      alignSelf: 'center',
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    headline: { fontSize: 24, fontWeight: '800', color: c.text, textAlign: 'center', marginTop: 16 },
    sub: { fontSize: 15, color: c.muted, textAlign: 'center', marginTop: 6, marginBottom: 20 },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 14,
    },
    benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    benefitText: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
    freeNote: { fontSize: 12, lineHeight: 18, color: c.muted, textAlign: 'center', marginTop: 12, marginBottom: 12 },
    intro: { fontSize: 13, fontWeight: '600', color: c.primary, textAlign: 'center', marginBottom: 8 },
    plan: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.card,
      gap: 10,
    },
    planOn: { borderWidth: 2, borderColor: c.primary, backgroundColor: c.primarySoft },
    planTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    planTrial: { fontSize: 12, fontWeight: '600', color: c.primary, marginTop: 2 },
    planPrice: { fontSize: 16, fontWeight: '800', color: c.text },
    planSave: { fontSize: 12, fontWeight: '700', color: c.done, marginTop: 2 },
    adsFreeBody: { fontSize: 12, color: c.muted, marginTop: 2 },
    cta: {
      marginTop: 16,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    },
    ctaText: { fontSize: 16, fontWeight: '800', color: c.onAccent },
    message: { fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'center', marginTop: 14 },
    unavailable: { fontSize: 14, color: c.muted, textAlign: 'center', marginTop: 20, lineHeight: 20 },
    activeCard: { alignItems: 'center', marginTop: 8 },
    activeTitle: { fontSize: 18, fontWeight: '800', color: c.primary },
    activeBody: { fontSize: 14, color: c.muted, textAlign: 'center' },
    secondaryBtn: {
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 20,
    },
    secondaryText: { fontSize: 14, fontWeight: '700', color: c.text },
    restore: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 10 },
    restoreText: { fontSize: 14, fontWeight: '700', color: c.primary },
    fineprint: { fontSize: 11, lineHeight: 16, color: c.faint, textAlign: 'center', marginTop: 8 },
    links: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 10, flexWrap: 'wrap' },
    link: { fontSize: 12, fontWeight: '600', color: c.muted, textDecorationLine: 'underline' },
  });
