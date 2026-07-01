// Alışkanlık işaret dairesi — hem "Bugün" hem "Alışkanlıklar" ekranında kullanılır.
// Alışkanlığın rengiyle çevrelenmiş bir daire: tamamlandıysa dolu + ✓, değilse
// soluk zeminli + emoji (varsa). İkon/renk yoksa varsayılan renge düşer.
// Salt görsel; dokunma davranışı çağıran ekranda (Pressable) tanımlanır.

import { StyleSheet, Text, View } from 'react-native';
import { DEFAULT_HABIT_COLOR } from './theme';

interface Props {
  icon: string | null;
  color: string | null;
  completed: boolean;
}

export function HabitToggle({ icon, color, completed }: Props) {
  const c = color ?? DEFAULT_HABIT_COLOR;
  return (
    <View
      style={[
        styles.circle,
        { borderColor: c, backgroundColor: completed ? c : c + '22' },
      ]}
    >
      {completed ? (
        <Text style={styles.check}>✓</Text>
      ) : icon ? (
        <Text style={styles.emoji}>{icon}</Text>
      ) : null}
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
  check: { color: '#fff', fontSize: 15, fontWeight: '800' },
  emoji: { fontSize: 15 },
});
