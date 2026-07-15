// Hedef düzenleme paneli (sayfayı ortalayan modal).
// "Hedefler" ekranında bir hedefin başlığına dokununca açılır.
// Sayısal hedefte: başlık, hedef değeri, birim ve mevcut değer düzenlenir.
// Tarihli hedefte: başlık ve son tarih düzenlenir.
// goal_type DEĞİŞTİRİLMEZ — tip değişimi alanları tutarsız bırakır (salt gösterilir).
// Görev/alışkanlık modallarıyla simetrik. Mimari kural: SQL yok - yalnızca goalRepo.

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { goalRepo } from '@/db';
import type { Goal } from '@/db';
import { toYmd } from '@/lib/helpers';
import { ConfirmDeleteButton } from '@/ui/ConfirmDeleteButton';
import { NUMBER_MAX_LEN, TITLE_MAX_LEN, UNIT_MAX_LEN } from '@/ui/formLimits';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { shortDate, type Colors } from '@/ui/theme';

interface Props {
  goal: Goal | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function GoalEditModal({ goal, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t, lang } = useI18n();
  const styles = makeStyles(colors);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState(''); // sayısal hedef değeri (metin)
  const [unit, setUnit] = useState('');
  const [current, setCurrent] = useState(''); // sayısal mevcut değer (metin)
  const [deadline, setDeadline] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Panel her açıldığında formu seçilen hedefin değerleriyle doldur.
  useEffect(() => {
    if (goal) {
      setTitle(goal.title);
      setTarget(goal.target_value != null ? String(goal.target_value) : '');
      setUnit(goal.unit ?? '');
      setCurrent(String(goal.current_value));
      setDeadline(goal.deadline ? goal.deadline.slice(0, 10) : null);
      setShowPicker(false);
    }
  }, [goal]);

  if (!goal) return null;
  const numeric = goal.goal_type === 'numeric';

  const save = () => {
    const t = title.trim();
    if (!t) return;
    if (numeric) {
      const targetNum = parseFloat(target.replace(',', '.'));
      const currentNum = parseFloat(current.replace(',', '.'));
      goalRepo.update(goal.id, {
        title: t,
        target_value: Number.isFinite(targetNum) ? targetNum : null,
        unit: unit.trim() || null,
        current_value: Number.isFinite(currentNum) ? currentNum : 0,
      });
    } else {
      goalRepo.update(goal.id, { title: t, deadline });
    }
    onChanged();
    onClose();
  };

  const remove = () => {
    goalRepo.softDelete(goal.id);
    onChanged();
    onClose();
  };

  const onPickDate = (_e: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setDeadline(toYmd(picked));
  };

  return (
    <ModalCard visible onClose={onClose}>
        <Text style={styles.heading}>{t('goal.edit')}</Text>

        {/* Tip (salt gösterim) */}
        <Text style={styles.typeTag}>{numeric ? t('goal.typeNumeric') : t('goal.typeDeadline')}</Text>

        {/* Başlık */}
        <Text style={styles.label}>{t('task.title')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('goal.titleShort')}
          placeholderTextColor={colors.faint}
          maxLength={TITLE_MAX_LEN}
        />
        <Text style={styles.counter}>
          {title.length}/{TITLE_MAX_LEN}
        </Text>

        {numeric ? (
          <>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>{t('goal.targetValue')}</Text>
                <TextInput
                  style={styles.input}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType="numeric"
                  placeholder={t('goal.targetExample')}
                  placeholderTextColor={colors.faint}
                  maxLength={NUMBER_MAX_LEN}
                />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>{t('goal.unit')}</Text>
                <TextInput
                  style={styles.input}
                  value={unit}
                  onChangeText={setUnit}
                  placeholder={t('goal.unitExample')}
                  placeholderTextColor={colors.faint}
                  maxLength={UNIT_MAX_LEN}
                />
              </View>
            </View>

            <Text style={styles.label}>{t('goal.currentValue')}</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              keyboardType="numeric"
              placeholder={t('goal.currentExample')}
              placeholderTextColor={colors.faint}
              maxLength={NUMBER_MAX_LEN}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>{t('goal.deadlineLabel')}</Text>
            <View style={styles.dateRow}>
              <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
                <Text style={styles.dateBtnText}>
                  {deadline ? shortDate(deadline, lang) : t('goal.pickDate')}
                </Text>
              </Pressable>
              {deadline && (
                <Pressable style={styles.clearBtn} onPress={() => setDeadline(null)}>
                  <Text style={styles.clearBtnText}>{t('common.clear')}</Text>
                </Pressable>
              )}
            </View>

            {showPicker && (
              <DateTimePicker
                value={deadline ? new Date(`${deadline}T00:00:00`) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onPickDate}
              />
            )}
          </>
        )}

        {/* Eylemler */}
        <View style={styles.actions}>
          <ConfirmDeleteButton onConfirm={remove} />
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          </Pressable>
        </View>
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 8, textAlign: 'center' },
    typeTag: {
      alignSelf: 'flex-start',
      fontSize: 12,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 8,
      overflow: 'hidden',
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      marginBottom: 8,
      marginTop: 4,
    },
    counter: { fontSize: 11, color: c.faint, textAlign: 'right', marginTop: -8, marginBottom: 12 },
    input: {
      backgroundColor: c.inputBg,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 12,
    },
    row: { flexDirection: 'row', gap: 12 },
    col: { flex: 1 },
    dateRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
    dateBtn: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    dateBtnText: { fontSize: 15, color: c.text },
    clearBtn: { paddingVertical: 12, paddingHorizontal: 14 },
    clearBtnText: { fontSize: 14, color: c.muted, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    saveBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 15,
      borderRadius: 14,
      backgroundColor: c.primary,
      shadowColor: c.primary,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: c.onAccent },
  });
