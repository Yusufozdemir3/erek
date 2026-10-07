// The centered modal shell of the add and edit forms: scrolls long content,
// rises with the keyboard, closes on a backdrop tap. No data.

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
  scroll?: boolean;
}

export function ModalCard({ visible, onClose, children, scroll = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  // Android back with the keyboard open only closes the keyboard, so a reflexive
  // back press doesn't throw away what was typed.
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
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
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
