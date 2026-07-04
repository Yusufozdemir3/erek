// Alışkanlık düzenleme paneli (alttan açılan modal).
// "Alışkanlıklar" ekranında bir alışkanlığa basınca açılır. Alanların tamamı ortak
// HabitForm bileşeninde; burası yalnızca modal kabuğu + kalıcılık (update/delete)
// ve bildirim programlaması. Oluşturma tarafı (AddSheet) aynı formu kullanır.
// Mimari kural: SQL yok - yalnızca habitRepo çağrılır.

import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { cancelHabitReminder, scheduleHabitReminder } from '@/lib/notifications';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';

interface Props {
  habit: Habit | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function HabitEditModal({ habit, onClose, onChanged }: Props) {
  if (!habit) return null;

  const handleSubmit = (values: HabitFormValues) => {
    habitRepo.update(habit.id, values);
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

  const handleDelete = () => {
    habitRepo.softDelete(habit.id);
    cancelHabitReminder(habit.id);
    onChanged();
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Arka plan - dokununca kapanır */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.heading}>Alışkanlığı düzenle</Text>
          {/* key: farklı alışkanlığa geçince form taze başlangıç değerleriyle kurulur */}
          <HabitForm
            key={habit.id}
            userId={habit.user_id}
            initial={habit}
            submitLabel="Kaydet"
            onSubmit={handleSubmit}
            onDelete={handleDelete}
          />
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
});
