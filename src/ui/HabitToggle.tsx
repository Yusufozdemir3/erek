// Habit indicator circle — used on both the "Today" and "Habits" screens.
// A circle outlined with the habit's color, always showing the habit's icon
// (or the default glyph); completion is shown by filling the circle solid
// (icon color flips to onAccent for contrast) rather than swapping the icon
// out for a checkmark — the title's strikethrough is what signals "done".
// Falls back to the default color if no icon/color is set.
// Purely visual; tap behavior is defined by the calling screen (Pressable).

import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { HabitIconGlyph } from '@/ui/habitIcons';
import { DEFAULT_HABIT_COLOR } from './theme';

interface Props {
  icon: string | null;
  color: string | null;
  completed: boolean;
}

export function HabitToggle({ icon, color, completed }: Props) {
  const { colors } = useTheme();
  const c = color ?? DEFAULT_HABIT_COLOR;
  return (
    <View
      style={[
        styles.circle,
        { borderColor: c, backgroundColor: completed ? c : c + '22' },
      ]}
    >
      <HabitIconGlyph id={icon} size={15} color={completed ? colors.onAccent : c} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
