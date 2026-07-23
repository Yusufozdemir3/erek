// Alışkanlığın GÖRÜNÜMÜ: emoji/ikon ızgarası + renk paleti. HabitForm'dan
// AYRILDI (denetim bulgusu H1). Formdaki tek gerçekten bağımsız blok buydu —
// yalnız iki değer okur, iki setter çağırır; sihirbazın adım durumuna, doğrulama
// kurallarına ya da submit'e hiç dokunmaz.
//
// Seçili olana tekrar basmak seçimi KALDIRIR (ikisi de opsiyonel: ikon yoksa
// varsayılan glif, renk yoksa DEFAULT_HABIT_COLOR kullanılır).

import { Pressable, Text, View } from 'react-native';
import { HABIT_ICON_SET, HabitIconGlyph } from '@/ui/habitIcons';
import { HABIT_COLORS, type Colors } from '@/ui/theme';
import type { HabitFormStyles } from '@/ui/habitFormStyles';

export interface HabitAppearancePickerProps {
  icon: string | null;
  onIconChange: (icon: string | null) => void;
  color: string | null;
  onColorChange: (color: string | null) => void;
  /** Seçili ikonun vurgu rengi — renk seçilmemişse varsayılan alışkanlık rengi. */
  previewColor: string;
  colors: Colors;
  styles: HabitFormStyles;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function HabitAppearancePicker({
  icon,
  onIconChange,
  color,
  onColorChange,
  previewColor,
  colors,
  styles,
  t,
}: HabitAppearancePickerProps) {
  return (
    <>
      <Text style={styles.label}>{t('habit.icon')}</Text>
      <View style={styles.iconGrid}>
        {HABIT_ICON_SET.map((entry) => {
          const sel = icon === entry.id;
          return (
            <Pressable
              key={entry.id}
              style={[
                styles.iconCell,
                sel && {
                  borderColor: previewColor,
                  backgroundColor: previewColor + '1f',
                  borderWidth: 2,
                },
              ]}
              onPress={() => onIconChange(sel ? null : entry.id)}
              accessibilityLabel={t(entry.labelKey)}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
            >
              <HabitIconGlyph id={entry.id} size={20} color={sel ? previewColor : colors.muted} />
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('habit.color')}</Text>
      <View style={styles.colorRow}>
        {HABIT_COLORS.map((c, i) => {
          const sel = color === c;
          return (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, sel && styles.swatchSel]}
              onPress={() => onColorChange(sel ? null : c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={t('habit.colorOptionA11y', { n: i + 1 })}
            >
              {sel && <Text style={styles.swatchCheck}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
