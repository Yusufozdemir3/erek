// Ekranı ortalayan modal kabuğu — hem ekleme (AddSheet) hem düzenleme panelleri
// (görev/alışkanlık/hedef) bunu paylaşır: alttan açılan sheet yerine ortada kart.
// Uzun içerik ScrollView'da kaydırılır; klavye açılınca kart yukarı kalkar.
// Arka fona dokununca kapanır. Mimari kural: yalnız görsel kabuk, veri yok.

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  // İçerik ScrollView içinde mi sarılsın (uzun formlar için). Varsayılan: evet.
  scroll?: boolean;
}

export function ModalCard({ visible, onClose, children, scroll = true }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {scroll ? (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    padding: 20,
    // Uzun form taşınca içerik kaydırılsın.
    maxHeight: '100%',
  },
});
