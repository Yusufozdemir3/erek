// Alışkanlık düzenleme paneli (alttan açılan modal).
// "Alışkanlıklar" ekranında bir alışkanlığa basınca açılır. Başlık ve hatırlatma
// saati düzenlenir; alışkanlık buradan silinebilir (soft delete).
// Görevlerdeki TaskEditModal ile simetrik; öncelik yerine hatırlatma saati var.
// Mimari kural: SQL yok - yalnızca habitRepo çağrılır.

import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { habitRepo } from '@/db';
import type { Habit, Recurrence } from '@/db';
import { cancelHabitReminder, scheduleHabitReminder } from '@/lib/notifications';
import { HABIT_COLORS, HABIT_ICONS } from '@/ui/theme';

// Sıklık seçicideki gün düğmeleri (Pazartesi'den Pazar'a; wd = JS getDay).
const WEEKDAY_OPTIONS = [
  { label: 'Pzt', wd: 1 },
  { label: 'Sal', wd: 2 },
  { label: 'Çar', wd: 3 },
  { label: 'Per', wd: 4 },
  { label: 'Cum', wd: 5 },
  { label: 'Cmt', wd: 6 },
  { label: 'Paz', wd: 0 },
];

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
  const [icon, setIcon] = useState<string | null>(null);         // emoji | null
  const [color, setColor] = useState<string | null>(null);       // "#rrggbb" | null
  const [everyDay, setEveryDay] = useState(true);                // her gün mü
  const [weekdays, setWeekdays] = useState<number[]>([]);        // belirli günler (JS getDay)
  const [showPicker, setShowPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Panel her açıldığında formu seçilen alışkanlığın değerleriyle doldur.
  useEffect(() => {
    if (habit) {
      setTitle(habit.title);
      setRemindAt(habit.remind_at);
      setIcon(habit.icon);
      setColor(habit.color);
      const sch = habit.schedule;
      if (sch && sch.freq === 'weekly' && (sch.weekdays?.length ?? 0) > 0) {
        setEveryDay(false);
        setWeekdays(sch.weekdays!);
      } else {
        setEveryDay(true);
        setWeekdays([]);
      }
      setShowPicker(false);
      setConfirmDelete(false);
    }
  }, [habit]);

  const toggleWeekday = (wd: number) => {
    setWeekdays((prev) =>
      prev.includes(wd) ? prev.filter((x) => x !== wd) : [...prev, wd]
    );
  };

  if (!habit) return null;

  const save = () => {
    const t = title.trim();
    if (!t) return;
    // "Belirli günler" seçili ama hiç gün yoksa "her gün" (null) kabul edilir.
    const schedule: Recurrence | null =
      everyDay || weekdays.length === 0
        ? null
        : { freq: 'weekly', weekdays: [...weekdays].sort((a, b) => a - b) };
    habitRepo.update(habit.id, { title: t, remind_at: remindAt, icon, color, schedule });
    onChanged();
    onClose();
    // Veriyi yazdıktan sonra bildirimi güncelle (saat değiştiyse yeniden kurar,
    // kaldırıldıysa iptal eder). Güncel hali DB'den alınır.
    const updated = habitRepo.getById(habit.id);
    if (updated) {
      scheduleHabitReminder(updated).then((ok) => {
        if (!ok) {
          Alert.alert(
            'Bildirim izni yok',
            'Hatırlatma kaydedildi ama bildirim gönderebilmek için izin gerekiyor. Telefon ayarlarından bu uygulamaya bildirim izni verebilirsin.'
          );
        }
      });
    }
  };

  const remove = () => {
    habitRepo.softDelete(habit.id);
    cancelHabitReminder(habit.id);
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
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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

        {/* İkon (emoji) — seçili olana tekrar basınca kaldırılır */}
        <Text style={styles.label}>İkon</Text>
        <View style={styles.iconGrid}>
          {HABIT_ICONS.map((em) => {
            const sel = icon === em;
            return (
              <Pressable
                key={em}
                style={[styles.iconCell, sel && styles.iconCellSel]}
                onPress={() => setIcon(sel ? null : em)}
              >
                <Text style={styles.iconText}>{em}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Renk — seçili olana tekrar basınca varsayılana döner */}
        <Text style={styles.label}>Renk</Text>
        <View style={styles.colorRow}>
          {HABIT_COLORS.map((c) => {
            const sel = color === c;
            return (
              <Pressable
                key={c}
                style={[styles.swatch, { backgroundColor: c }, sel && styles.swatchSel]}
                onPress={() => setColor(sel ? null : c)}
              >
                {sel && <Text style={styles.swatchCheck}>✓</Text>}
              </Pressable>
            );
          })}
        </View>

        {/* Sıklık — her gün ya da haftanın belirli günleri */}
        <Text style={styles.label}>Sıklık</Text>
        <View style={styles.freqRow}>
          <Pressable
            style={[styles.freqBtn, everyDay && styles.freqBtnSel]}
            onPress={() => setEveryDay(true)}
          >
            <Text style={[styles.freqBtnText, everyDay && styles.freqBtnTextSel]}>Her gün</Text>
          </Pressable>
          <Pressable
            style={[styles.freqBtn, !everyDay && styles.freqBtnSel]}
            onPress={() => {
              setEveryDay(false);
              // Boşsa yardımcı olsun diye bugünün gününü seçili getir.
              if (weekdays.length === 0) setWeekdays([new Date().getDay()]);
            }}
          >
            <Text style={[styles.freqBtnText, !everyDay && styles.freqBtnTextSel]}>
              Belirli günler
            </Text>
          </Pressable>
        </View>

        {!everyDay && (
          <View style={styles.dayRow}>
            {WEEKDAY_OPTIONS.map(({ label, wd }) => {
              const sel = weekdays.includes(wd);
              return (
                <Pressable
                  key={wd}
                  style={[styles.dayChip, sel && styles.dayChipSel]}
                  onPress={() => toggleWeekday(wd)}
                >
                  <Text style={[styles.dayChipText, sel && styles.dayChipTextSel]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
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
        </ScrollView>
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
    maxHeight: '88%',
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
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  iconCell: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconCellSel: { borderColor: '#4f46e5', backgroundColor: '#e0e7ff', borderWidth: 2 },
  iconText: { fontSize: 20 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSel: { borderWidth: 3, borderColor: '#0f172a' },
  swatchCheck: { color: '#fff', fontSize: 14, fontWeight: '800' },
  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  freqBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  freqBtnSel: { borderColor: '#4f46e5', backgroundColor: '#e0e7ff', borderWidth: 2 },
  freqBtnText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  freqBtnTextSel: { color: '#4f46e5' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  dayChip: {
    width: 42,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  dayChipSel: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayChipText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  dayChipTextSel: { color: '#fff' },
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
