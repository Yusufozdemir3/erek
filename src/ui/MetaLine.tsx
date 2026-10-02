// The small grey "meta" line under a card title (schedule, reminder, linked
// goal, due date …). Each item can carry a line icon instead of an emoji, so
// the lists use the same icon language as the tab bar and the habit icons
// (emoji rendered differently per device and clashed with the vector icons).

import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';

export type MetaItem =
  | { text: string; icon?: keyof typeof Feather.glyphMap; danger?: boolean }
  | null
  | false
  | undefined;

export function MetaLine({ items }: { items: MetaItem[] }) {
  const { colors } = useTheme();
  const visible = items.filter((i): i is NonNullable<Exclude<MetaItem, false>> => !!i);
  if (visible.length === 0) return null;
  return (
    <View style={styles.row}>
      {visible.map((item, i) => {
        const color = item.danger ? colors.danger : colors.muted;
        return (
          <View key={i} style={styles.item}>
            {i > 0 && <Text style={[styles.sep, { color: colors.faint }]}>·</Text>}
            {item.icon && <Feather name={item.icon} size={12} color={color} style={styles.icon} />}
            <Text style={[styles.text, { color }, item.danger && styles.danger]}>{item.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 3 },
  item: { flexDirection: 'row', alignItems: 'center' },
  sep: { fontSize: 12, marginHorizontal: 6 },
  icon: { marginRight: 4 },
  text: { fontSize: 12 },
  danger: { fontWeight: '700' },
});
