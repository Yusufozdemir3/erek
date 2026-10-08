// A slim strip above the tab bar while a timer runs, with quick pause. It
// re-renders with the timer context, which ticks every second.

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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTimer } from '@/ui/TimerProvider';

// Above the tab bar when there is no system bar to add.
const STRIP_BOTTOM = 58;

export function TimerStrip() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  // Edge-to-edge (forced on Android 16): the tab bar grows by the system bar, and so must the offset.
  const { bottom: bottomInset } = useSafeAreaInsets();
  const timer = useTimer();
  const activeTarget = timer.active();
  const kind = activeTarget?.kind ?? null;
  const id = activeTarget?.id ?? null;

  // One lookup per session, not one SQLite query per second. A rename during
  // the session shows after it ends.
  const meta = useMemo(() => {
    if (!kind || !id) return null;
    if (kind === 'habit') {
      const habit = habitRepo.getById(id);
      if (!habit) return null; // deleted meanwhile
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
    <View style={[styles.wrap, { bottom: STRIP_BOTTOM + bottomInset }]} pointerEvents="box-none">
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
    wrap: {
      position: 'absolute',
      left: 12,
      right: 12,
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
