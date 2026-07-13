// Alışkanlık düzenleme paneli (sayfayı ortalayan modal).
// "Alışkanlıklar" ekranında bir alışkanlığa basınca açılır. Alanların tamamı ortak
// HabitForm bileşeninde; burası yalnızca modal kabuğu + kalıcılık (update/delete)
// ve bildirim programlaması. Oluşturma tarafı (AddSheet) aynı formu kullanır.
// Mimari kural: SQL yok - yalnızca habitRepo çağrılır.

import { Alert, StyleSheet, Text } from 'react-native';
import { habitRepo } from '@/db';
import type { Habit } from '@/db';
import { cancelHabitReminder, scheduleHabitReminder } from '@/lib/notifications';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';

interface Props {
  habit: Habit | null; // null = panel kapalı
  onClose: () => void;
  onChanged: () => void; // kaydet/sil sonrası parent listeyi tazelesin
}

export function HabitEditModal({ habit, onClose, onChanged }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
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
          Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
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
    <ModalCard visible onClose={onClose}>
      <Text style={[styles.heading, { color: colors.text }]}>{t('habit.edit')}</Text>
      {/* key: farklı alışkanlığa geçince form taze başlangıç değerleriyle kurulur */}
      <HabitForm
        key={habit.id}
        userId={habit.user_id}
        kind={habit.kind}
        initial={habit}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </ModalCard>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
});
