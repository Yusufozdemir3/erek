// Aktif zamanlayıcı mini durum şeridi — sekme çubuğunun hemen üstünde, YALNIZ
// bir zamanlayıcı çalışırken görünür (boşta hiçbir yer kaplamaz). Hem durum
// göstergesi hem hızlı duraklatma erişimi. TimerProvider her saniye kendi
// context değerini yenilediği için (bkz. TimerProvider yorumu) burada ayrı bir
// interval kurmaya gerek yok — useTimer() zaten canlı tikler.

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

  if (!activeTarget) return null;

  const { kind, id } = activeTarget;
  const live = timer.liveSeconds(kind, id) ?? 0;

  let title: string;
  let target: number;
  let icon: string | null = null;
  let color = DEFAULT_HABIT_COLOR;
  if (kind === 'habit') {
    const habit = habitRepo.getById(id);
    if (!habit) return null; // silinmiş olabilir (nadir yarış); şerit sessizce kaybolur
    title = habit.title;
    target = habit.target_amount ?? 0;
    icon = habit.icon;
    color = habit.color ?? DEFAULT_HABIT_COLOR;
  } else {
    const goal = goalRepo.getById(id);
    if (!goal) return null;
    title = goal.title;
    target = goal.target_value ?? 0;
  }

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
    // Sekme çubuğunun hemen üstünde ortalanmış ince bir şerit (AddFab'ın
    // yaylanan seçenekleriyle aynı referans yükseklik — bkz. AddFab.fan).
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
