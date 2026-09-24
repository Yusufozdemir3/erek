// Mini status strip for the active timer — right above the tab bar, visible
// ONLY while a timer is running (takes up no space when idle). Both a status
// indicator and quick access to pause. Since TimerProvider refreshes its own
// context value every second (see the TimerProvider comment), there's no need
// to set up a separate interval here — useTimer() already ticks live.

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { goalRepo, habitRepo } from '@/db';
import { fmtClock } from '@/lib/helpers';
import { tapLight } from '@/lib/haptics';
import { DEFAULT_HABIT_COLOR, type Colors } from '@/ui/theme';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useTimer } from '@/ui/TimerProvider';

export function TimerStrip() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const timer = useTimer();
  const activeTarget = timer.active();
  const kind = activeTarget?.kind ?? null;
  const id = activeTarget?.id ?? null;

  // Title/icon/color/target DON'T CHANGE for the duration of the timer, but this
  // component re-renders every second (the context ticks live). If the lookup
  // weren't tied to the target's identity, a 45-minute session would mean 2700
  // unnecessary synchronous SQLite queries — all on the JS thread, all for the
  // same unchanging row. useMemo brings it down to ONE query per session.
  // (Deliberate limitation: if the habit's name is changed while the timer is
  // running, the strip shows the old name until the session ends. The
  // alternative — copying the name into ActiveTimer and writing it to
  // AsyncStorage — would decouple the data from its single source of truth.)
  const meta = useMemo(() => {
    if (!kind || !id) return null;
    if (kind === 'habit') {
      const habit = habitRepo.getById(id);
      if (!habit) return null; // may have been deleted (a rare race); the strip silently disappears
      return {
        title: habit.title,
        target: habit.target_amount ?? 0,
        icon: habit.icon,
        color: habit.color ?? DEFAULT_HABIT_COLOR,
      };
    }
    const goal = goalRepo.getById(id);
    if (!goal) return null;
    return {
      title: goal.title,
      target: goal.target_value ?? 0,
      icon: null as string | null,
      color: DEFAULT_HABIT_COLOR,
    };
  }, [kind, id]);

  if (!activeTarget || !meta || !kind || !id) return null;

  const { title, target, icon, color } = meta;
  const live = timer.liveSeconds(kind, id) ?? 0;

  const openTarget = () => {
    if (kind === 'habit') router.push({ pathname: '/habit/[id]', params: { id } });
    else router.push({ pathname: '/goal/[id]', params: { id } });
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={[styles.bar, { borderColor: color }]} onPress={openTarget}>
        <View style={[styles.iconWrap, { borderColor: color, backgroundColor: color + '22' }]}>
          {kind === 'habit' ? (
            <HabitIconGlyph id={icon} size={14} color={color} />
          ) : (
            <Feather name="target" size={14} color={color} />
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.clock}>
          {fmtClock(Math.floor(live))}
          {target > 0 ? ` / ${fmtClock(target)}` : ''}
        </Text>
        <Pressable
          style={styles.pauseBtn}
          onPress={() => {
            tapLight();
            timer.pause();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('timer.stripPauseA11y')}
        >
          <Text style={styles.pauseBtnText}>❚❚</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // A slim strip centered right above the tab bar (same reference height as
    // AddFab's spring-out options — see AddFab.fan).
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 58,
      alignItems: 'center',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 8,
      paddingHorizontal: 10,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    iconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    clock: { fontSize: 12, fontWeight: '700', color: c.primary },
    pauseBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pauseBtnText: { fontSize: 10, fontWeight: '800', color: c.onAccent },
  });
