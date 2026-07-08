// Listelerde kişilikli boş durum: büyük emoji + başlık + (isteğe bağlı) alt metin.
// Dört sekmede (Bugün/Görevler/Alışkanlıklar/Hedefler) düz "Henüz X yok" metnini
// değiştirir. Renkler theme token'ından — karanlık mod otomatik uyum sağlar.

import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

interface Props {
  emoji: string;
  title: string;
  subtitle?: string;
}

export function EmptyState({ emoji, title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emoji: { fontSize: 46, marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
});
