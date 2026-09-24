// Centered modal shell — shared by both the add sheet (AddSheet) and the edit
// panels (task/habit/goal): a centered card instead of a bottom sheet.
// Long content scrolls inside a ScrollView; the card rises when the keyboard opens.
// Tapping the backdrop dismisses it. Architectural rule: visual shell only, no data.

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
  // Whether to wrap the content in a ScrollView (for long forms). Default: yes.
  scroll?: boolean;
}

export function ModalCard({ visible, onClose, children, scroll = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  // On Android, the hardware back button triggers the Modal's onRequestClose
  // directly. With the keyboard open, this used to close the whole form when the
  // user's reflex was "use the back button to dismiss the keyboard," losing what
  // they'd typed. Now, while the keyboard is open, back only dismisses it first;
  // the modal only closes once the keyboard is already closed.
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
            {/* Slim handle bar — centered at the top for a premium feel */}
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
    // Elevated card feel: soft shadow + Android elevation.
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    // Let content scroll when a long form overflows.
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
