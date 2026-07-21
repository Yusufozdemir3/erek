// Özel saat seçici — native @react-native-community/datetimepicker'ın yerini
// alır. İki mod: kaydırmalı "tekerlek" (saat/dakika, varsayılan) ve elle yazma
// (klavye ikonuyla geçilir — hızlı, kesin bir saat girmek isteyenler için).
// İki mod aynı hour/minute state'ini paylaşır; aralarında geçişte senkron kalır.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import type { Colors } from '@/ui/theme';
import { ModalCard } from '@/ui/ModalCard';
import { WheelColumn } from '@/ui/WheelColumn';

interface Props {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  title?: string;
  minuteStep?: number; // varsayılan 1
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function TimePickerModal({ visible, value, onClose, onConfirm, title, minuteStep = 1 }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);

  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep),
    [minuteStep]
  );

  const [mode, setMode] = useState<'wheel' | 'manual'>('wheel');
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(() => {
    const m = value.getMinutes();
    return minuteStep > 1 ? Math.round(m / minuteStep) * minuteStep : m;
  });
  // Elle yazma modunun taslak metinleri — kullanıcı yazarken (tek hane, boş vb.)
  // ham haliyle tutulur; hour/minute'a ancak geçerli olunca yansır.
  const [hourText, setHourText] = useState(() => pad2(hour));
  const [minuteText, setMinuteText] = useState(() => pad2(minute));

  if (!visible) return null;

  const toggleMode = () => {
    if (mode === 'wheel') {
      setHourText(pad2(hour));
      setMinuteText(pad2(minute));
      setMode('manual');
    } else {
      setMode('wheel');
    }
  };

  const onHourText = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHourText(digits);
    if (digits.length === 2) {
      const n = Math.min(23, Math.max(0, parseInt(digits, 10)));
      setHour(n);
      setHourText(pad2(n));
    }
  };
  const onHourBlur = () => {
    const n = hourText === '' ? hour : Math.min(23, Math.max(0, parseInt(hourText, 10) || 0));
    setHour(n);
    setHourText(pad2(n));
  };

  const onMinuteText = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMinuteText(digits);
    if (digits.length === 2) {
      const n = Math.min(59, Math.max(0, parseInt(digits, 10)));
      setMinute(n);
      setMinuteText(pad2(n));
    }
  };
  const onMinuteBlur = () => {
    const n = minuteText === '' ? minute : Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
    setMinute(n);
    setMinuteText(pad2(n));
  };

  const confirm = () => {
    const d = new Date(value);
    d.setHours(hour, minute, 0, 0);
    onConfirm(d);
    onClose();
  };

  return (
    <ModalCard visible={visible} onClose={onClose} scroll={false}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title}>{title ?? t('time.pickTitle')}</Text>
        <Pressable
          style={styles.modeBtn}
          onPress={toggleMode}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t(mode === 'wheel' ? 'time.switchToManual' : 'time.switchToWheel')}
        >
          <Feather name={mode === 'wheel' ? 'edit-2' : 'clock'} size={16} color={colors.primary} />
        </Pressable>
      </View>

      {mode === 'wheel' ? (
        <View style={styles.wheelArea}>
          <View style={styles.highlight} pointerEvents="none" />
          <View style={styles.columns}>
            <WheelColumn
              values={HOURS}
              selected={hour}
              onSelect={setHour}
              format={pad2}
              textColor={colors.text}
              fadeColor={colors.card}
            />
            <Text style={styles.colon}>:</Text>
            <WheelColumn
              values={minutes}
              selected={minute}
              onSelect={setMinute}
              format={pad2}
              textColor={colors.text}
              fadeColor={colors.card}
            />
          </View>
        </View>
      ) : (
        <View style={styles.manualArea}>
          <TextInput
            style={styles.manualInput}
            value={hourText}
            onChangeText={onHourText}
            onBlur={onHourBlur}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
            textAlign="center"
            accessibilityLabel={t('time.hourA11y')}
          />
          <Text style={styles.manualColon}>:</Text>
          <TextInput
            style={styles.manualInput}
            value={minuteText}
            onChangeText={onMinuteText}
            onBlur={onMinuteBlur}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
            textAlign="center"
            accessibilityLabel={t('time.minuteA11y')}
          />
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          style={styles.cancelBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        >
          <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={styles.confirmBtn}
          onPress={confirm}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
        >
          <Text style={styles.confirmBtnText}>{t('common.done')}</Text>
        </Pressable>
      </View>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    headerSpacer: { width: 28 },
    title: { flex: 1, fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'center' },
    modeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inputBg,
    },
    wheelArea: { height: 220, justifyContent: 'center' },
    highlight: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      marginTop: -22,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
    },
    columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    colon: { fontSize: 24, fontWeight: '700', color: c.text, marginHorizontal: 4 },
    manualArea: {
      height: 220,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    manualInput: {
      width: 76,
      height: 68,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
      fontSize: 32,
      fontWeight: '800',
      color: c.text,
    },
    manualColon: { fontSize: 28, fontWeight: '800', color: c.text, marginHorizontal: 10 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
    cancelBtn: { paddingVertical: 10, paddingHorizontal: 4 },
    cancelBtnText: { fontSize: 14, fontWeight: '600', color: c.muted },
    confirmBtn: {
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: 12,
      backgroundColor: c.primary,
    },
    confirmBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  });
