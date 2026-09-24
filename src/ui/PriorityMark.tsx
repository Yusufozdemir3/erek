// Task priority indicator — encodes color + SHAPE together (color alone would be
// indistinguishable for a color-blind user): low = circle, medium = square,
// high = diamond (a square rotated 45°). Priority name is in the a11y label.
// Replaces the old plain colored dot on the right of "Today" and "Tasks" cards.

import { StyleSheet, View } from 'react-native';
import type { Priority } from '@/db';
import { useI18n } from '@/i18n/I18nProvider';
import { PRIORITY_COLOR } from '@/ui/theme';

export function PriorityMark({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return (
    <View
      accessibilityLabel={t('priority.a11y', { label: t(`priority.${priority}`) })}
      style={[
        styles.base,
        { backgroundColor: PRIORITY_COLOR[priority] },
        priority === 'low' && styles.low,
        priority === 'high' && styles.high,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { width: 10, height: 10, borderRadius: 2 }, // medium: square
  low: { borderRadius: 5 },                          // low: circle
  high: { transform: [{ rotate: '45deg' }] },        // high: diamond
});
