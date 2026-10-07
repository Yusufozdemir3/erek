// The setup wizard's shell (navigation, progress, skipping, closing work): look →
// first habit, task, goal → notifications → widget → account. Every step and
// the whole wizard can be skipped. Runs on first launch (OnboardingGate) and
// from Profile › Setup wizard. Pages: WizardSteps.tsx; pure parts: wizardLogic.ts.

import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ACCOUNTS_ENABLED } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { notificationPermission, rescheduleEverything } from '@/lib/notifications';
import { isGoogleSignInConfigured, isSyncConfigured } from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useTheme } from '@/ui/ThemeProvider';
import {
  AccountStep,
  DoneStep,
  GoalStep,
  HabitStep,
  LookStep,
  NotificationsStep,
  TaskStep,
  WelcomeStep,
  WidgetStep,
  type StepProps,
  type WizardForm,
} from './WizardSteps';
import { makeWizardStyles } from './wizardStyles';
import {
  buildSteps,
  continueBlocked,
  progress,
  SKIPPABLE,
  type Created,
  type Outcomes,
  type StepId,
  type WizardCapabilities,
} from './wizardLogic';

export interface WizardResult {
  skippedAll: boolean;
  // The account page was shown, so the separate login screen shouldn't follow.
  accountSeen: boolean;
}

interface Props {
  onDone: (result: WizardResult) => void;
}

// What this build/device can do (decides which pages exist).
export function wizardCapabilities(): WizardCapabilities {
  return {
    accounts: ACCOUNTS_ENABLED && isGoogleSignInConfigured && isSyncConfigured,
    widget: Platform.OS === 'android',
  };
}

export function SetupWizard({ onDone }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeWizardStyles(colors);
  const { user, authUser, notifyDataChanged } = useAppData();
  const steps = useMemo(() => buildSteps(wizardCapabilities()), []);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcomes>({});
  const [created, setCreated] = useState<Created>({});
  const [finishing, setFinishing] = useState(false);
  const [form, setForm] = useState<WizardForm | null>(null);
  const maxIndex = useRef(0);
  const scroll = useRef<ScrollView>(null);

  const id = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const step = progress(steps, index);
  const completed = outcomes[id] === 'done';
  const blocked = continueBlocked(form, completed);

  const markDone = useCallback((s: StepId) => setOutcomes((o) => (o[s] === 'done' ? o : { ...o, [s]: 'done' })), []);
  const onCompleted = useCallback(() => markDone(id), [id, markDone]);
  const onCreated = useCallback<StepProps['onCreated']>(
    (kind, title) => {
      setCreated((c) => ({ ...c, [kind]: title }));
      notifyDataChanged();
    },
    [notifyDataChanged]
  );

  const go = (to: number) => {
    const next = Math.max(0, Math.min(steps.length - 1, to));
    maxIndex.current = Math.max(maxIndex.current, next);
    setIndex(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // "Continue" saves a filled-in form first (so nothing typed is lost); on a
  // page where nothing was done it counts as skipping it.
  const next = () => {
    if (blocked) return;
    if (form?.ready) form.submit();
    else if (SKIPPABLE.has(id) && outcomes[id] === undefined) setOutcomes((o) => ({ ...o, [id]: 'skipped' }));
    go(index + 1);
  };
  const skipStep = () => {
    setOutcomes((o) => ({ ...o, [id]: 'skipped' }));
    go(index + 1);
  };

  const finish = async (skippedAll: boolean) => {
    if (finishing) return;
    setFinishing(true);
    // Reminders made here were only saved; schedule them now that the
    // notification page may have granted permission.
    if (!skippedAll && (await notificationPermission()).granted) {
      await rescheduleEverything(user.id).catch(() => {});
    }
    const accountAt = steps.indexOf('account');
    onDone({ skippedAll, accountSeen: accountAt >= 0 && maxIndex.current >= accountAt });
  };

  const props: StepProps = { userId: user.id, onCompleted, onCreated, registerForm: setForm };
  const signedIn = !!authUser && !authUser.isAnonymous;

  let page: React.JSX.Element;
  switch (id) {
    case 'welcome':
      page = <WelcomeStep />;
      break;
    case 'look':
      page = <LookStep {...props} />;
      break;
    case 'habit':
      page = <HabitStep {...props} />;
      break;
    case 'task':
      page = <TaskStep {...props} />;
      break;
    case 'goal':
      page = <GoalStep {...props} />;
      break;
    case 'notifications':
      page = <NotificationsStep {...props} />;
      break;
    case 'widget':
      page = <WidgetStep {...props} />;
      break;
    case 'account':
      page = <AccountStep {...props} />;
      break;
    default:
      page = (
        <DoneStep
          created={created}
          outcomes={outcomes}
          notificationsOn={outcomes.notifications === 'done'}
          signedIn={signedIn}
        />
      );
  }

  return (
    <LinearGradient colors={[colors.primarySoft, colors.bg]} locations={[0, 0.5]} style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.progressWrap}>
          {step && (
            <>
              <Text
                style={styles.progressLabel}
                accessibilityLabel={t('wizard.progressA11y', { current: step.current, total: step.total })}
              >
                {t('wizard.progress', { current: step.current, total: step.total })}
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(step.current / step.total) * 100}%` }]} />
              </View>
            </>
          )}
        </View>
        {!isLast && (
          <Pressable
            onPress={() => finish(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('wizard.skipAllA11y')}
          >
            <Text style={styles.skipAll}>{t('wizard.skipAll')}</Text>
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {page}
        </ScrollView>

        <View style={styles.footer}>
          {!isFirst && (
            <Pressable
              style={styles.backBtn}
              onPress={() => go(index - 1)}
              accessibilityRole="button"
              accessibilityLabel={t('wizard.back')}
            >
              <Text style={styles.backText}>{t('wizard.back')}</Text>
            </Pressable>
          )}
          {SKIPPABLE.has(id) && !completed && (
            <Pressable style={styles.skipStep} onPress={skipStep} accessibilityRole="button">
              <Text style={styles.skipStepText}>{t('wizard.skipStep')}</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.nextBtn, blocked && styles.primaryBtnOff]}
            onPress={isLast ? () => finish(false) : next}
            disabled={finishing || blocked}
            accessibilityRole="button"
            accessibilityState={{ disabled: finishing || blocked }}
            accessibilityLabel={isLast ? t('wizard.finish') : isFirst ? t('wizard.start') : t('wizard.next')}
          >
            <Text style={styles.nextText}>{isLast ? t('wizard.finish') : isFirst ? t('wizard.start') : t('wizard.next')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
