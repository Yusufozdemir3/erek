// Ekranı ortalayan modal kabuğu — hem ekleme (AddSheet) hem düzenleme panelleri
// (görev/alışkanlık/hedef) bunu paylaşır: alttan açılan sheet yerine ortada kart.
// Uzun içerik ScrollView'da kaydırılır; klavye açılınca kart yukarı kalkar.
// Arka fona dokununca kapanır. Mimari kural: yalnız görsel kabuk, veri yok.

import { useEffect, useRef, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  // İçerik ScrollView içinde mi sarılsın (uzun formlar için). Varsayılan: evet.
  scroll?: boolean;
}

export function ModalCard({ visible, onClose, children, scroll = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  // Android'de donanım geri tuşu doğrudan Modal'ın onRequestClose'unu tetikler.
  // Klavye açıkken bu, kullanıcının "geri tuşuyla klavyeyi kapat" refleksiyle
  // tüm formu kapatıp yazdığını kaybettiriyordu. Klavye açıkken geri tuşu artık
  // önce yalnızca klavyeyi kapatır; modal ancak klavye kapalıyken kapanır.
  const keyboardVisible = useRef(false);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisible.current = true;
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardVisible.current = false;
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleRequestClose = () => {
    if (keyboardVisible.current) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Narin tutamaç çizgisi — premium his için üstte ortalanmış */}
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
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
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    // Yükseltilmiş kart hissi: yumuşak gölge + Android elevation.
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    // Uzun form taşınca içerik kaydırılsın.
    maxHeight: '100%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
    opacity: 0.7,
  },
});
