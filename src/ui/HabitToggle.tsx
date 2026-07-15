// Alışkanlık işaret dairesi — hem "Bugün" hem "Alışkanlıklar" ekranında kullanılır.
// Alışkanlığın rengiyle çevrelenmiş bir daire: tamamlandıysa dolu + ✓, değilse
// soluk zeminli + ikon (varsa, alışkanlığın rengiyle tintlenmiş çizgi glif — bkz.
// habitIcons.tsx). İkon/renk yoksa varsayılan renge düşer.
// Salt görsel; dokunma davranışı çağıran ekranda (Pressable) tanımlanır.

import { StyleSheet, Text, View } from 'react-native';
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
      {completed ? (
        <Text style={[styles.check, { color: colors.onAccent }]}>✓</Text>
      ) : (
        <HabitIconGlyph id={icon} size={15} color={c} />
      )}
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
  check: { fontSize: 15, fontWeight: '800' },
});
