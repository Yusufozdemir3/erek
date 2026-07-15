// Sola kaydırınca sağda Düzenle+Sil aksiyonları açılan satır sarmalayıcı.
// Görevler/Alışkanlıklar/Hedefler listelerinde kullanılır — "Bugün" ekranında
// BİLİNÇLİ OLARAK yok (orada kart zaten dokununca işaretliyor, swipe çakışırdı).
// Yeni native bağımlılık EKLENMEDİ: react-native-gesture-handler kurulu değildi,
// eklemek yeniden native build gerektirirdi. Bunun yerine çekirdek React Native
// PanResponder + Animated (transform: translateX) ile, mevcut Expo Go/derlenmiş
// APK'da anında test edilebilecek şekilde kuruldu.
//
// Silme ikinci dokunuşla onaylanır (ConfirmDeleteButton ile aynı güvenlik
// deseni — uygulamanın her yerinde tek-dokunuşla silme YOK). Aynı anda yalnızca
// bir satır açık kalsın diye açık/kapalı durumu PARENT'ta tutulur (isOpen/
// onOpenChange) — yeni bir satır açılınca öncekiler otomatik kapanır.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from './theme';

const ACTION_WIDTH = 56;
const ACTIONS_WIDTH = ACTION_WIDTH * 2;
const OPEN_THRESHOLD = ACTIONS_WIDTH / 2;

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editA11yLabel: string;
  deleteA11yLabel: string;
  children: ReactNode;
}

export function SwipeableRow({
  onEdit,
  onDelete,
  isOpen,
  onOpenChange,
  editA11yLabel,
  deleteA11yLabel,
  children,
}: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const translateX = useRef(new Animated.Value(0)).current;
  // Gesture callback'leri ilk render'da donduğu için `isOpen` prop'unu taze
  // tutmak üzere ref'e aynalanır (klasik PanResponder+useRef bayatlık sorunu).
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  const offsetRef = useRef(0); // gesture başlarken translateX'in dinlenme değeri
  const [armed, setArmed] = useState(false);

  const animateTo = (value: number) => {
    Animated.spring(translateX, { toValue: value, useNativeDriver: true, bounciness: 0 }).start();
  };

  // Dışarıdan (başka bir satır açılınca) kapatılırsa senkron ol.
  useEffect(() => {
    if (!isOpen) {
      animateTo(0);
      setArmed(false);
    }
  }, [isOpen]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        offsetRef.current = isOpenRef.current ? -ACTIONS_WIDTH : 0;
      },
      onPanResponderMove: (_e, g) => {
        const next = Math.min(0, Math.max(-ACTIONS_WIDTH, offsetRef.current + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const next = offsetRef.current + g.dx;
        const shouldOpen = next < -OPEN_THRESHOLD;
        animateTo(shouldOpen ? -ACTIONS_WIDTH : 0);
        onOpenChange(shouldOpen);
        if (!shouldOpen) setArmed(false);
      },
    })
  ).current;

  const close = () => {
    animateTo(0);
    onOpenChange(false);
    setArmed(false);
  };

  const handleDeletePress = () => {
    if (armed) onDelete();
    else setArmed(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => {
            close();
            onEdit();
          }}
          accessibilityRole="button"
          accessibilityLabel={editA11yLabel}
        >
          <Feather name="edit-3" size={20} color={colors.onAccent} />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn, armed && styles.deleteBtnArmed]}
          onPress={handleDeletePress}
          accessibilityRole="button"
          accessibilityLabel={armed ? t('common.deleteConfirm') : deleteA11yLabel}
        >
          <Feather name="trash-2" size={20} color={colors.onAccent} />
        </Pressable>
      </View>
      <Animated.View
        style={[styles.sliding, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {children}
        {/* Açıkken kart üstüne dokunmak (kenarlar dahil) satırı kapatır, alttaki
            düzenleme dokunuşuna sızmaz. */}
        {isOpen && <Pressable style={StyleSheet.absoluteFill} onPress={close} />}
      </Animated.View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    // overflow:'hidden' KRİTİK — yoksa aksiyon paneli kart kapalıyken bile
    // kenarlardan taşıp görünür (bildirilen görsel bozukluk buydu).
    container: { overflow: 'hidden', borderRadius: 14 },
    sliding: { width: '100%' },
    actions: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      right: 0,
      flexDirection: 'row',
      borderRadius: 14,
      overflow: 'hidden',
    },
    actionBtn: {
      width: ACTION_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    deleteBtn: { backgroundColor: c.danger },
    deleteBtnArmed: { backgroundColor: '#7f1d1d' },
  });
