// A habit's circle on Today and Habits: outlined in its color with its icon;
// completed = filled (the icon switches to onAccent). Visual only.

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
