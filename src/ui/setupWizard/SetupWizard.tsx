// The setup wizard's shell (navigation, progress, skipping, closing work): look →
// first habit, task, goal → notifications → widget → account. Every step and
// the whole wizard can be skipped. Runs on first launch (OnboardingGate) and
// from Profile › Setup wizard. Pages: WizardSteps.tsx; pure parts: wizardLogic.ts.
// On first launch the welcome page asks "new here, or used it before?": the
// second answer takes the short path (buildReturningSteps) to signing in.

import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ACCOUNTS_ENABLED } from '@/config';
import { useI18n } from '@/i18n/I18nProvider';
import { notificationPermission, rescheduleEverything } from '@/lib/notifications';
import { isGoogleSignInConfigured, isSyncConfigured } from '@/sync';
import { useAppData } from '@/ui/AppData';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/ui/ThemeProvider';
import {
  AccountStep,
  DoneStep,
  GoalStep,
  GuidesStep,
  TipsStep,
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
  buildReturningSteps,
  buildSteps,
  continueBlocked,
  isSkippable,
  progress,
  REQUIRED_STEPS,
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
  // First launch: no "skip all", and the first habit, task and goal must be made.
  required?: boolean;
}

// What this build/device can do (decides which pages exist).
export function wizardCapabilities(): WizardCapabilities {
  return {
    accounts: ACCOUNTS_ENABLED && isGoogleSignInConfigured && isSyncConfigured,
    widget: Platform.OS === 'android',
  };
}

export function SetupWizard({ onDone, required = false }: Props) {
  const { colors } = useTheme();
  // Edge-to-edge (forced on Android 16): keep the fixed margins, but never less than the system bars + a gap.
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const styles = makeWizardStyles(colors);
  const { user, authUser, notifyDataChanged } = useAppData();
  const cap = useMemo(() => wizardCapabilities(), []);
  const newSteps = useMemo(() => buildSteps(cap), [cap]);
  const returningSteps = useMemo(() => buildReturningSteps(cap), [cap]);
  // Only on first launch, and only if there is an account to come back to.
  const offerReturning = required && cap.accounts;
  const [returning, setReturning] = useState(false);
  const steps = returning ? returningSteps : newSteps;
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcomes>({});
  const [created, setCreated] = useState<Created>({});
  const [finishing, setFinishing] = useState(false);
  const [form, setForm] = useState<WizardForm | null>(null);
  const maxIndex = useRef(0);
  const scroll = useRef<ScrollViewInstance>(null);

  const id = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const step = progress(steps, index);
  const completed = outcomes[id] === 'done';
  const skippable = isSkippable(id, required);
  const blocked = continueBlocked(form, completed, required && REQUIRED_STEPS.has(id));

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

  // The welcome page's answer: the path starts at its second page.
  const choosePath = (isReturning: boolean) => {
    setReturning(isReturning);
    maxIndex.current = 1;
    setIndex(1);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  // "Continue" saves a filled-in form first (so nothing typed is lost); on a
  // page where nothing was done it counts as skipping it.
  const next = () => {
    if (blocked) return;
    if (form?.ready) form.submit();
    else if (skippable && outcomes[id] === undefined) setOutcomes((o) => ({ ...o, [id]: 'skipped' }));
    go(index + 1);
  };
  const skipStep = () => {
    if (!skippable) return;
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
      page = <WelcomeStep required={required} onChoose={offerReturning ? choosePath : undefined} />;
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
      page = <AccountStep {...props} returning={returning} />;
      break;
    case 'tips':
      page = <TipsStep {...props} />;
      break;
    case 'guides':
      page = <GuidesStep {...props} />;
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
      <View style={[styles.topBar, { paddingTop: Math.max(52, insets.top + 16) }]}>
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
        {!isLast && !required && (
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
          {required && REQUIRED_STEPS.has(id) && !completed && (
            <Text style={styles.note}>{t('wizard.required')}</Text>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(36, insets.bottom + 16) }]}>
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
          {skippable && !completed && (
            <Pressable style={styles.skipStep} onPress={skipStep} accessibilityRole="button">
              <Text style={styles.skipStepText}>{t('wizard.skipStep')}</Text>
            </Pressable>
          )}
          {/* The welcome page's two answers are its buttons. */}
          {!(isFirst && offerReturning) && (
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
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
