// The individual pages of the setup wizard. Each one is self-contained: it owns
// its own form state, writes through the same repos the + sheet uses (no SQL
// here), and tells the shell when it has done something (`onCompleted`) so the
// shell can tell "done" from "skipped". Nothing in a step is mandatory.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { goalRepo, habitRepo, reminderRepo, taskRepo } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { LANG_LABELS, SUPPORTED_LANGS } from '@/i18n/translations';
import { todayDate } from '@/lib/helpers';
import { ensurePermission, notificationPermission } from '@/lib/notifications';
import { getNotificationPrefs, setNotificationPref } from '@/lib/notificationPrefs';
import { parseTask } from '@/lib/quickAdd/parseTask';
import { useAppData } from '@/ui/AppData';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { LineIcon, type LineIconId } from '@/ui/LineIcon';
import { ACCENT_ORDER, ACCENT_THEMES, longDateLabel, switchColors } from '@/ui/theme';
import { useGoogleSignIn } from '@/ui/useGoogleSignIn';
import { useTheme, type ThemeMode } from '@/ui/ThemeProvider';
import { useVoiceInput } from '@/ui/useVoiceInput';
import { VoiceButton } from '@/ui/VoiceButton';
import { fitTitle } from '@/ui/voiceTaskPatch';
import { makeWizardStyles } from './wizardStyles';
import {
  DEADLINE_PRESET_DAYS,
  deadlineIn,
  dueDateOf,
  GOAL_SUGGESTIONS,
  HABIT_SUGGESTIONS,
  parseTarget,
  REMINDER_PRESETS,
  scheduleFor,
  summaryLines,
  type Created,
  type HabitFrequency,
  type Outcomes,
} from './wizardLogic';

export interface StepProps {
  userId: string;
  onCompleted: () => void; // the user did something on this page
  onCreated: (kind: keyof Created, title: string) => void;
}

function useWizardStyles() {
  const { colors } = useTheme();
  return { colors, styles: makeWizardStyles(colors) };
}

function Header({ icon, title, body }: { icon: LineIconId; title: string; body?: string }) {
  const { colors, styles } = useWizardStyles();
  return (
    <>
      <View style={styles.badge}>
        <LineIcon id={icon} size={44} color={colors.primary} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { styles } = useWizardStyles();
  return (
    <Pressable
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- welcome

export function WelcomeStep() {
  const { t } = useI18n();
  const { styles } = useWizardStyles();
  return (
    <>
      <Header icon="welcome" title={t('wizard.welcome.title')} body={t('wizard.welcome.body')} />
      <Text style={styles.note}>{t('wizard.welcome.note')}</Text>
    </>
  );
}

// ------------------------------------------------------------------- look

export function LookStep({ onCompleted }: StepProps) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode, accent, setAccent, scheme } = useTheme();
  const { styles } = useWizardStyles();
  const themes: { mode: ThemeMode; labelKey: string }[] = [
    { mode: 'light', labelKey: 'profile.themeLight' },
    { mode: 'dark', labelKey: 'profile.themeDark' },
    { mode: 'system', labelKey: 'profile.themeSystem' },
  ];
  return (
    <>
      <Header icon="appearance" title={t('wizard.look.title')} body={t('wizard.look.body')} />

      <Text style={styles.label}>{t('profile.language')}</Text>
      <View style={styles.seg}>
        {SUPPORTED_LANGS.map((l) => (
          <Pressable
            key={l}
            style={[styles.segBtn, lang === l && styles.segBtnOn]}
            onPress={() => {
              setLang(l);
              onCompleted();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: lang === l }}
          >
            <Text style={[styles.segText, lang === l && styles.segTextOn]}>{LANG_LABELS[l]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('profile.appearance')}</Text>
      <View style={styles.seg}>
        {themes.map((o) => (
          <Pressable
            key={o.mode}
            style={[styles.segBtn, mode === o.mode && styles.segBtnOn]}
            onPress={() => {
              setMode(o.mode);
              onCompleted();
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === o.mode }}
          >
            <Text style={[styles.segText, mode === o.mode && styles.segTextOn]}>{t(o.labelKey)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('profile.accentColor')}</Text>
      <View style={styles.accentRow}>
        {ACCENT_ORDER.map((key) => {
          const on = accent === key;
          return (
            <Pressable
              key={key}
              style={styles.accentItem}
              onPress={() => {
                setAccent(key);
                onCompleted();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(`profile.accent.${key}`)}
            >
              <View
                style={[styles.accentSwatch, { backgroundColor: ACCENT_THEMES[key][scheme].primary }, on && styles.accentSwatchOn]}
              >
                {on && <Text style={styles.accentCheck}>✓</Text>}
              </View>
              <Text style={styles.accentLabel}>{t(`profile.accent.${key}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ------------------------------------------------------------------ habit

export function HabitStep({ userId, onCompleted, onCreated }: StepProps) {
  const { t } = useI18n();
  const { colors, styles } = useWizardStyles();
  const [title, setTitle] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [freq, setFreq] = useState<HabitFrequency>('daily');
  const [remind, setRemind] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  const pick = (id: string) => {
    const s = HABIT_SUGGESTIONS.find((x) => x.id === id);
    if (!s) return;
    setSuggestion(id);
    setTitle(t(s.labelKey));
    setFreq(s.schedule?.timesPerWeek ? 'threePerWeek' : 'daily');
  };

  const add = () => {
    const name = title.trim();
    if (!name) return;
    const s = HABIT_SUGGESTIONS.find((x) => x.id === suggestion);
    const created = habitRepo.create({
      user_id: userId,
      title: name,
      kind: 'binary',
      // The icon only belongs to the suggestion's own wording: a title edited by hand loses it.
      icon: s && t(s.labelKey) === name ? s.icon : null,
      schedule: scheduleFor(freq),
      // Same as the habit form: a new habit starts today (otherwise the days before
      // it existed would count as missed in the statistics and the weekly review).
      start_date: todayDate(),
    });
    // Scheduling happens once, after the notification step (it may need the
    // permission asked for there): the shell calls rescheduleEverything.
    reminderRepo.replaceAll('habit', created.id, remind ? [remind] : []);
    onCreated('habit', name);
    onCompleted();
    setAdded(name);
  };

  const again = () => {
    setAdded(null);
    setTitle('');
    setSuggestion(null);
    setFreq('daily');
    setRemind(null);
  };

  return (
    <>
      <Header icon="habit" title={t('wizard.habit.title')} body={t('wizard.habit.body')} />
      {added ? (
        <>
          <View style={styles.success}>
            <Text style={styles.successText}>✓ {t('wizard.habit.added', { title: added })}</Text>
          </View>
          <Pressable style={styles.outlineBtn} onPress={again} accessibilityRole="button">
            <Text style={styles.outlineText}>{t('wizard.habit.addAnother')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('wizard.habit.pick')}</Text>
          <View style={styles.chips}>
            {HABIT_SUGGESTIONS.map((s) => (
              <Chip key={s.id} label={t(s.labelKey)} on={suggestion === s.id} onPress={() => pick(s.id)} />
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setSuggestion(null);
            }}
            placeholder={t('wizard.habit.placeholder')}
            placeholderTextColor={colors.faint}
            maxLength={TITLE_MAX_LEN}
          />

          <Text style={styles.label}>{t('wizard.habit.freq')}</Text>
          <View style={styles.chips}>
            {(['daily', 'weekdays', 'threePerWeek'] as HabitFrequency[]).map((f) => (
              <Chip key={f} label={t(`wizard.habit.f.${f}`)} on={freq === f} onPress={() => setFreq(f)} />
            ))}
          </View>

          <Text style={styles.label}>{t('wizard.habit.remind')}</Text>
          <View style={styles.chips}>
            {REMINDER_PRESETS.map((time) => (
              <Chip
                key={time ?? 'none'}
                label={time ?? t('wizard.habit.noRemind')}
                on={remind === time}
                onPress={() => setRemind(time)}
              />
            ))}
          </View>

          <Pressable
            style={[styles.primaryBtn, !title.trim() && styles.primaryBtnOff]}
            onPress={add}
            disabled={!title.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: !title.trim() }}
          >
            <Text style={styles.primaryText}>{t('wizard.habit.add')}</Text>
          </Pressable>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------- task

export function TaskStep({ userId, onCompleted, onCreated }: StepProps) {
  const { t, lang } = useI18n();
  const { colors, styles } = useWizardStyles();
  const [text, setText] = useState('');
  const [added, setAdded] = useState<string | null>(null);
  const voice = useVoiceInput((heard) => setText(heard.slice(0, 300)));
  // Typed or spoken, the sentence is understood the same way as in the quick-add mic.
  const parsed = useMemo(() => parseTask(text, lang, new Date()), [text, lang]);
  const title = fitTitle(parsed.title || text.trim()).title;
  const hasWhen = !!(parsed.date || parsed.time);

  const add = () => {
    if (!title) return;
    taskRepo.create({
      user_id: userId,
      title,
      priority: parsed.priority ?? 'medium',
      due_date: dueDateOf(parsed.date, parsed.time, todayDate()),
    });
    onCreated('task', title);
    onCompleted();
    setAdded(title);
  };

  const again = () => {
    setAdded(null);
    setText('');
  };

  return (
    <>
      <Header icon="task" title={t('wizard.task.title')} body={t('wizard.task.body')} />
      {added ? (
        <>
          <View style={styles.success}>
            <Text style={styles.successText}>✓ {t('wizard.task.added', { title: added })}</Text>
          </View>
          <Pressable style={styles.outlineBtn} onPress={again} accessibilityRole="button">
            <Text style={styles.outlineText}>{t('wizard.task.addAnother')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={t('wizard.task.placeholder')}
              placeholderTextColor={colors.faint}
              maxLength={300}
            />
            {voice.supported && <VoiceButton listening={voice.listening} onPress={voice.toggle} />}
          </View>
          {voice.listening ? (
            <Text style={styles.live} accessibilityLiveRegion="polite">
              {voice.partial ? `“${voice.partial}”` : t('voice.listening')}
            </Text>
          ) : voice.error ? (
            <Text style={styles.error}>{voice.error}</Text>
          ) : null}

          {hasWhen && (
            <View style={styles.preview}>
              <Text style={styles.previewText}>
                {t('wizard.task.when')}:{' '}
                {parsed.date ? longDateLabel(parsed.date, lang) : t('wizard.task.noDate')}
                {parsed.time ? `, ${parsed.time}` : ''}
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.primaryBtn, !title && styles.primaryBtnOff]}
            onPress={add}
            disabled={!title}
            accessibilityRole="button"
            accessibilityState={{ disabled: !title }}
          >
            <Text style={styles.primaryText}>{t('wizard.task.add')}</Text>
          </Pressable>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------- goal

export function GoalStep({ userId, onCompleted, onCreated }: StepProps) {
  const { t } = useI18n();
  const { colors, styles } = useWizardStyles();
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [days, setDays] = useState<number>(90);
  const [added, setAdded] = useState<string | null>(null);
  const targetValue = parseTarget(target);
  const ready = title.trim().length > 0 && targetValue !== null;

  const pick = (id: string) => {
    const g = GOAL_SUGGESTIONS.find((x) => x.id === id);
    if (!g) return;
    setSuggestion(id);
    setTitle(t(g.labelKey));
    setTarget(String(g.target));
    setUnit(t(g.unitKey));
  };

  const add = () => {
    if (!ready || targetValue === null) return;
    const name = title.trim();
    goalRepo.create({
      user_id: userId,
      title: name,
      goal_type: 'numeric',
      target_value: targetValue,
      unit: unit.trim() || null,
      deadline: deadlineIn(days),
      start_date: todayDate(),
    });
    onCreated('goal', name);
    onCompleted();
    setAdded(name);
  };

  const again = () => {
    setAdded(null);
    setTitle('');
    setTarget('');
    setUnit('');
    setSuggestion(null);
    setDays(90);
  };

  return (
    <>
      <Header icon="goal" title={t('wizard.goal.title')} body={t('wizard.goal.body')} />
      {added ? (
        <>
          <View style={styles.success}>
            <Text style={styles.successText}>✓ {t('wizard.goal.added', { title: added })}</Text>
          </View>
          <Pressable style={styles.outlineBtn} onPress={again} accessibilityRole="button">
            <Text style={styles.outlineText}>{t('wizard.goal.addAnother')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('wizard.goal.pick')}</Text>
          <View style={styles.chips}>
            {GOAL_SUGGESTIONS.map((g) => (
              <Chip key={g.id} label={t(g.labelKey)} on={suggestion === g.id} onPress={() => pick(g.id)} />
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setSuggestion(null);
            }}
            placeholder={t('wizard.goal.placeholder')}
            placeholderTextColor={colors.faint}
            maxLength={TITLE_MAX_LEN}
          />

          <View style={styles.twoCols}>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>{t('wizard.goal.target')}</Text>
              <TextInput
                style={styles.input}
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={colors.faint}
                maxLength={NUMBER_MAX_LEN}
              />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>{t('wizard.goal.unit')}</Text>
              <TextInput
                style={styles.input}
                value={unit}
                onChangeText={setUnit}
                placeholder="km"
                placeholderTextColor={colors.faint}
                maxLength={UNIT_MAX_LEN}
              />
            </View>
          </View>

          <Text style={styles.label}>{t('wizard.goal.deadline')}</Text>
          <View style={styles.chips}>
            {DEADLINE_PRESET_DAYS.map((d) => (
              <Chip key={d} label={t(`wizard.goal.d.${d}`)} on={days === d} onPress={() => setDays(d)} />
            ))}
          </View>

          <Pressable
            style={[styles.primaryBtn, !ready && styles.primaryBtnOff]}
            onPress={add}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={styles.primaryText}>{t('wizard.goal.add')}</Text>
          </Pressable>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------- notifications

export function NotificationsStep({ onCompleted }: StepProps) {
  const { t } = useI18n();
  const { colors, styles } = useWizardStyles();
  const [perm, setPerm] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [sound, setSound] = useState(true);
  const [vibration, setVibration] = useState(true);

  useEffect(() => {
    let alive = true;
    notificationPermission().then((p) => {
      if (!alive) return;
      setPerm(p);
      // Already allowed (earlier, or by the system default): notifications ARE on, so
      // the page counts as done and the closing summary says so.
      if (p.granted) onCompleted();
    });
    getNotificationPrefs().then((p) => {
      if (!alive) return;
      setSound(p.sound);
      setVibration(p.vibration);
    });
    return () => {
      alive = false;
    };
  }, [onCompleted]);

  const allow = async () => {
    const granted = await ensurePermission().catch(() => false);
    const p = await notificationPermission();
    setPerm(granted ? { granted: true, canAskAgain: p.canAskAgain } : p);
    if (granted) {
      setNotificationPref('enabled', true).catch(() => {});
      onCompleted();
    }
  };

  return (
    <>
      <Header icon="bell" title={t('wizard.notif.title')} body={t('wizard.notif.body')} />
      {perm === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : perm.granted ? (
        <>
          <Text style={styles.okText}>{t('wizard.notif.granted')}</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('wizard.notif.sound')}</Text>
            <Switch
              value={sound}
              onValueChange={(v) => {
                setSound(v);
                setNotificationPref('sound', v).catch(() => {});
              }}
              {...switchColors(colors, sound)}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('wizard.notif.vibration')}</Text>
            <Switch
              value={vibration}
              onValueChange={(v) => {
                setVibration(v);
                setNotificationPref('vibration', v).catch(() => {});
              }}
              {...switchColors(colors, vibration)}
            />
          </View>
          <Text style={styles.note}>{t('wizard.notif.hint')}</Text>
        </>
      ) : perm.canAskAgain ? (
        <Pressable style={styles.primaryBtn} onPress={allow} accessibilityRole="button">
          <Text style={styles.primaryText}>{t('wizard.notif.allow')}</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.warnText}>{t('wizard.notif.denied')}</Text>
          <Pressable
            style={styles.outlineBtn}
            onPress={() => Linking.openSettings().catch(() => {})}
            accessibilityRole="button"
          >
            <Text style={styles.outlineText}>{t('wizard.notif.openSettings')}</Text>
          </Pressable>
        </>
      )}
    </>
  );
}

// ----------------------------------------------------------------- widget

export function WidgetStep({ onCompleted }: StepProps) {
  const { t } = useI18n();
  const { styles } = useWizardStyles();
  // There's no API to place a widget for the user: the page only explains. Opening
  // it counts as "done" for the summary's purposes — it just isn't listed there.
  useEffect(() => {
    onCompleted();
  }, [onCompleted]);
  return (
    <>
      <Header icon="widget" title={t('wizard.widget.title')} body={t('wizard.widget.body')} />
      {(['s1', 's2', 's3'] as const).map((k, i) => (
        <View key={k} style={styles.stepRow}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{i + 1}</Text>
          </View>
          <Text style={styles.stepText}>{t(`wizard.widget.${k}`)}</Text>
        </View>
      ))}
      <Text style={styles.note}>{t('wizard.widget.note')}</Text>
    </>
  );
}

// ---------------------------------------------------------------- account

export function AccountStep({ onCompleted }: StepProps) {
  const { t } = useI18n();
  const { styles, colors } = useWizardStyles();
  const { authUser } = useAppData();
  const google = useGoogleSignIn(onCompleted);
  const connected = !!authUser && !authUser.isAnonymous;
  return (
    <>
      <Header icon="cloud" title={t('wizard.account.title')} body={t('wizard.account.body')} />
      {connected ? (
        <>
          <Text style={styles.okText}>{t('wizard.account.connected')}</Text>
          {authUser?.email ? (
            <Text style={styles.note}>{t('wizard.account.connectedAs', { email: authUser.email })}</Text>
          ) : null}
        </>
      ) : (
        <>
          {google.error != null && <Text style={styles.error}>{google.error}</Text>}
          <Pressable
            style={[styles.googleBtn, google.busy && { opacity: 0.6 }]}
            onPress={google.signIn}
            disabled={google.busy}
            accessibilityRole="button"
            accessibilityLabel={t('login.google')}
          >
            {google.busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Text style={styles.googleMark}>G</Text>
                <Text style={styles.googleText}>{t('login.google')}</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.note}>{t('wizard.account.friends')}</Text>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------- done

export function DoneStep({
  created,
  outcomes,
  notificationsOn,
  signedIn,
}: {
  created: Created;
  outcomes: Outcomes;
  notificationsOn: boolean;
  signedIn: boolean;
}) {
  const { t } = useI18n();
  const { styles } = useWizardStyles();
  const lines = summaryLines(created, outcomes, notificationsOn, signedIn);
  return (
    <>
      <Header icon="done" title={t('wizard.done.title')} />
      {lines.length === 0 ? (
        <Text style={styles.body}>{t('wizard.done.empty')}</Text>
      ) : (
        <>
          <Text style={styles.body}>{t('wizard.done.body')}</Text>
          {lines.map((l) => (
            <View key={l.key} style={styles.summaryRow}>
              <Text style={styles.summaryCheck}>✓</Text>
              <Text style={styles.summaryText}>{t(`wizard.done.${l.key}`, { text: l.text ?? '' })}</Text>
            </View>
          ))}
        </>
      )}
      <Text style={styles.note}>{t('wizard.done.rerun')}</Text>
    </>
  );
}
