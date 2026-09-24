// A single scrollable number column (hour or minute) — a building block of
// TimePickerModal. Snaps to the nearest value on scroll release; can also be
// selected directly by tapping. The top/bottom edges fade into the background
// (the fade illusion is faked with opacity instead of a real gradient — so it
// doesn't require an extra dependency in RN).

import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5; // wheel height = ITEM_HEIGHT * VISIBLE_ITEMS
const PAD = (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2;

interface Props {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
  format: (v: number) => string;
  textColor: string;
  fadeColor: string;
}

export function WheelColumn({ values, selected, onSelect, format, textColor, fadeColor }: Props) {
  const listRef = useRef<FlatList<number>>(null);
  const selectedIndex = Math.max(0, values.indexOf(selected));

  // If `selected` changes externally (e.g. the modal reopens), scroll the list there.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitIndex = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), values.length - 1);
    const v = values[clamped];
    if (v !== selected) onSelect(v);
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={values}
        keyExtractor={(v) => String(v)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        initialScrollIndex={selectedIndex}
        onMomentumScrollEnd={(e) => commitIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT))}
        renderItem={({ item }) => {
          const isSelected = item === selected;
          return (
            <Pressable
              style={styles.item}
              onPress={() => {
                const idx = values.indexOf(item);
                listRef.current?.scrollToOffset({ offset: idx * ITEM_HEIGHT, animated: true });
                onSelect(item);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={format(item)}
            >
              <Text
                style={[
                  styles.itemText,
                  { color: textColor, opacity: isSelected ? 1 : 0.35 },
                  isSelected && styles.itemTextSelected,
                ]}
              >
                {format(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: ITEM_HEIGHT * VISIBLE_ITEMS, width: 72 },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 20, fontWeight: '600' },
  itemTextSelected: { fontSize: 24, fontWeight: '800' },
});
