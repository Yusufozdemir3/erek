// Alışkanlık düzenleme paneli (alttan açılan modal).
// "Alışkanlıklar" ekranında bir alışkanlığa basınca açılır. Başlık ve hatırlatma
// saati düzenlenir; alışkanlık buradan silinebilir (soft delete).
// Görevlerdeki TaskEditModal ile simetrik; öncelik yerine hatırlatma saati var.
// Mimari kural: SQL yok - yalnızca habitRepo çağrılır.

import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';

interface Props {
  habit: Habit | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

// "08:30" -> okunaklı etiket; null ise "Hatırlatma yok".
function timeLabel(hm: string | null): string {
  return hm ? hm : 'Hatırlatma yok';
}

function toHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// "08:30" -> bugünün o saatine ayarlı bir Date (picker başlangıç değeri için).
function hmToDate(hm: string | null): Date {
  const d = new Date();
  if (hm) {
    const [h, m] = hm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function HabitEditModal({ habit, onClose, onChanged }: Props) {
  const [title, setTitle] = useState('');
  const [remindAt, setRemindAt] = useState<string | null>(null); // "HH:MM" | null
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Panel her açıldığında formu seçilen alışkanlığın değerleriyle doldur.
  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setRemindAt(habit.remind_at);
      setShowPicker(false);
      setConfirmDelete(false);
    }
  }, [habit]);

  if (!habit) return null;

  const save = () => {
    const t = title.trim();
    if (!t) return;
    habitRepo.update(habit.id, { title: t, remind_at: remindAt });
    onChanged();
    onClose();
  };

  const remove = () => {
    habitRepo.softDelete(habit.id);
    onChanged();
    onClose();
  };

  // Android'de seçici tek seferlik bir dialog; iOS'ta satır içi kalır.
  const onPickTime = (_event: unknown, picked?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (picked) setRemindAt(toHm(picked));
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Arka plan - dokununca kapanır */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>Alışkanlığı düzenle</Text>

        {/* Başlık */}
        <Text style={styles.label}>Başlık</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Alışkanlık başlığı"
          placeholderTextColor="#94a3b8"
        />

        {/* Hatırlatma saati */}
        <Text style={styles.label}>Hatırlatma saati</Text>
        <View style={styles.row}>
          <Pressable style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <Text style={styles.dateBtnText}>{timeLabel(remindAt)}</Text>
          </Pressable>
          {remindAt && (
            <Pressable style={styles.clearBtn} onPress={() => setRemindAt(null)}>
              <Text style={styles.clearBtnText}>Temizle</Text>
            </Pressable>
          )}
        </View>

        {showPicker && (
          <DateTimePicker
            value={hmToDate(remindAt)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onPickTime}
          />
        )}

        {/* Eylemler */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.deleteBtn, confirmDelete && styles.deleteBtnConfirm]}
            onPress={() => (confirmDelete ? remove() : setConfirmDelete(true))}
          >
            <Text style={[styles.deleteBtnText, confirmDelete && styles.deleteBtnTextConfirm]}>
              {confirmDelete ? 'Silmek için tekrar bas' : 'Sil'}
            </Text>
          </Pressable>
          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>Kaydet</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 16,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  dateBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  dateBtnText: { fontSize: 15, color: '#0f172a' },
  clearBtn: { paddingVertical: 12, paddingHorizontal: 14 },
  clearBtnText: { fontSize: 14, color: '#64748b', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  deleteBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  deleteBtnConfirm: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#dc2626' },
  deleteBtnTextConfirm: { color: '#fff' },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4f46e5',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
