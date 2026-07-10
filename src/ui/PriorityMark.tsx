// Görev önceliği göstergesi — renk + BİÇİM birlikte kodlar (salt renk, renk
// körü kullanıcı için ayırt edilemezdi): düşük = daire, orta = kare,
// yüksek = elmas (45° dönük kare). Ekran okuyucu için öncelik adı etikette.
// "Bugün" ve "Görevler" kartlarının sağındaki eski düz renkli noktanın yerini alır.

import { StyleSheet, View } from 'react-native';
import type { Priority } from '@/db';
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/ui/theme';

export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <View
      accessibilityLabel={`Öncelik: ${PRIORITY_LABEL[priority]}`}
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
