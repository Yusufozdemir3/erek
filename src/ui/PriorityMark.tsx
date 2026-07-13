// Görev önceliği göstergesi — renk + BİÇİM birlikte kodlar (salt renk, renk
// körü kullanıcı için ayırt edilemezdi): düşük = daire, orta = kare,
// yüksek = elmas (45° dönük kare). Ekran okuyucu için öncelik adı etikette.
// "Bugün" ve "Görevler" kartlarının sağındaki eski düz renkli noktanın yerini alır.

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
  base: { width: 10, height: 10, borderRadius: 2 }, // orta: kare
  low: { borderRadius: 5 },                          // düşük: daire
  high: { transform: [{ rotate: '45deg' }] },        // yüksek: elmas
});
