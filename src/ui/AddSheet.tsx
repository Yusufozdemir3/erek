// Merkezi ＋ butonunun açtığı ekleme formu (sayfayı ortalayan modal — alttan
// değil). Genelde ＋ menüsü türü seçtiği için doğrudan ilgili formda açılır
// (initialStep); "‹ Geri" ile tür seçim menüsüne dönülebilir.
// Tüm türler oluşturma anında TAM ayarlarıyla eklenir: görev (TaskForm) ve
// alışkanlık (HabitForm) düzenleme paneliyle aynı formu paylaşır; hedef kendi
// tam formuyla (goals.tsx'ten taşınmış). Ekleme sonrası notifyDataChanged ile
// açık ekranların listeleri tazelenir ve ilgili sekmeye gidilir.
// Mimari kural: SQL yok — yalnızca repo çağrıları.

import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { goalMilestoneRepo, goalRepo, habitRepo, subtaskRepo, taskRepo } from '@/db';
import { scheduleHabitReminder, scheduleTaskReminder } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';
import { GoalForm, type GoalFormValues } from '@/ui/GoalForm';
import { HabitForm, type HabitFormValues } from '@/ui/HabitForm';
import { ModalCard } from '@/ui/ModalCard';
import { TaskForm, type TaskFormValues } from '@/ui/TaskForm';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { EntityIcon, type EntityType } from '@/ui/EntityIcon';
import type { Colors } from '@/ui/theme';

export type Step = 'menu' | 'task' | 'habit' | 'goal';

interface Props {
  visible: boolean;
  onClose: () => void;
  // Açılırken doğrudan gidilecek adım. Merkezi ＋ menüsü türü kendi seçtiği
  // için genelde bir form adımı verilir; verilmezse tür seçim menüsü açılır.
  initialStep?: Step;
}

// Metinler i18n anahtarı olarak tutulur; render'da t() ile çevrilir. İkonlar
// EntityIcon ile tab bar'daki aynı çizgi ikon setinden (tutarlılık).
const MENU_OPTIONS: { step: Step; type: EntityType; titleKey: string; descKey: string }[] = [
  { step: 'task', type: 'task', titleKey: 'add.task', descKey: 'add.taskDesc' },
  { step: 'habit', type: 'habit', titleKey: 'add.habit', descKey: 'add.habitDesc' },
  { step: 'goal', type: 'goal', titleKey: 'add.goal', descKey: 'add.goalDesc' },
];

export function AddSheet({ visible, onClose, initialStep = 'menu' }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(colors);
  const { user, notifyDataChanged, selectedDate } = useAppData();
  const [step, setStep] = useState<Step>(initialStep);

  // Her açılışta istenen adıma (varsayılan menü) dön.
  useEffect(() => {
    if (visible) setStep(initialStep);
  }, [visible, initialStep]);

  // Ekleme sonrası: menüyü kapat, listeleri tazele, ilgili sekmeye git.
  const finish = (tab: '/(tabs)/tasks' | '/(tabs)/habits' | '/(tabs)/goals') => {
    notifyDataChanged();
    onClose();
    router.navigate(tab);
  };

  // Görev, düzenleme paneliyle aynı TaskForm'la oluşturulur — öncelik, son tarih,
  // saat ve (isteğe bağlı) alt görevler oluşturma anında ayarlanabilir.
  const addTask = (values: TaskFormValues) => {
    const created = taskRepo.create({
      user_id: user.id,
      title: values.title,
      priority: values.priority,
      due_date: values.due_date,
      end_time: values.end_time,
    });
    // Taslak alt görevleri, görev yazıldıktan sonra sırayla oluştur.
    values.subtasks?.forEach((t) => subtaskRepo.create(created.id, t));
    // Son tarihte SAAT de seçildiyse o an bildirim kurulur (saatsizse no-op).
    scheduleTaskReminder(created).then((ok) => {
      if (!ok) Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
    });
    finish('/(tabs)/tasks');
  };

  // Alışkanlık, düzenleme paneliyle aynı HabitForm'la oluşturulur — tüm ayarlar
  // (ikon, renk, sıklık, tarih aralığı, nicel hedef, hatırlatma, hedefe bağla)
  // oluşturma anında ayarlanabilir.
  const addHabit = (values: HabitFormValues) => {
    const created = habitRepo.create({ user_id: user.id, ...values });
    // Hatırlatma saati seçildiyse bildirimi programla (izin yoksa uyar).
    if (created.remind_at) {
      scheduleHabitReminder(created).then((ok) => {
        if (!ok) {
          Alert.alert(t('notif.noPermTitle'), t('notif.noPermBody'));
        }
      });
    }
    finish('/(tabs)/habits');
  };

  // Hedef, düzenleme paneliyle aynı GoalForm'la oluşturulur — tip (sayısal/parçalı)
  // yalnızca burada seçilir, deadline zorunlu, taslak milestone'lar hedefle
  // birlikte yazılır.
  const addGoal = (values: GoalFormValues) => {
    const created = goalRepo.create({
      user_id: user.id,
      title: values.title,
      goal_type: values.goal_type,
      target_value: values.target_value,
      unit: values.unit,
      deadline: values.deadline,
    });
    values.milestones?.forEach((m) => goalMilestoneRepo.create(created.id, m));
    finish('/(tabs)/goals');
  };

  return (
    <ModalCard visible={visible} onClose={onClose}>
          {step === 'menu' ? (
            <>
              <Text style={styles.heading}>{t('add.menuTitle')}</Text>
              {MENU_OPTIONS.map((opt) => (
                <Pressable key={opt.step} style={styles.option} onPress={() => setStep(opt.step)}>
                  <View style={styles.optionIcon}>
                    <EntityIcon type={opt.type} size={22} color={colors.primary} />
                  </View>
                  <View style={styles.optionBody}>
                    <Text style={styles.optionTitle}>{t(opt.titleKey)}</Text>
                    <Text style={styles.optionDesc}>{t(opt.descKey)}</Text>
                  </View>
                  <Text style={styles.optionChevron}>›</Text>
                </Pressable>
              ))}
            </>
          ) : (
            // ModalCard içeriği zaten ScrollView'da sarar (uzun alışkanlık formu
            // güvenle kaydırılır, "Ekle" düğmesi kırpılmaz).
            <>
              <View style={styles.formHead}>
                <Pressable onPress={() => setStep('menu')} hitSlop={8}>
                  <Text style={styles.backText}>{t('common.back')}</Text>
                </Pressable>
                <Text style={styles.heading}>
                  {step === 'task' ? t('add.newTask') : step === 'habit' ? t('add.newHabit') : t('add.newGoal')}
                </Text>
                {/* başlığı ortalamak için sol taraftaki "‹ Geri" genişliğinde boşluk */}
                <View style={styles.headSpacer} />
              </View>

              {step === 'habit' ? (
                // Takip tipi (tik/sayısal/zamanlayıcı) sihirbazın kendi ilk adımı —
                // HabitForm'a `kind` verilmez, kullanıcı stepped modda seçer.
                <HabitForm
                  userId={user.id}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  stepped
                  onSubmit={addHabit}
                />
              ) : step === 'task' ? (
                // Görev: düzenleme paneliyle aynı tam form (öncelik, tarih, saat)
                // + oluşturmada taslak alt görev ekleme. Son tarih "Bugün" ekranında
                // o an bakılan güne varsayılanır (selectedDate) — Cuma'ya bakarken
                // eklenen görev Cuma'ya gitsin diye.
                <TaskForm
                  initial={{ due_date: selectedDate }}
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  enableSubtaskDraft
                  onSubmit={addTask}
                />
              ) : (
                // Hedef: düzenleme paneliyle aynı GoalForm — tip (sayısal/parçalı)
                // yalnızca oluştururken seçilir.
                <GoalForm
                  submitLabel={t('common.add')}
                  autoFocusTitle
                  enableMilestoneDraft
                  onSubmit={addGoal}
                />
              )}
            </>
          )}
    </ModalCard>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    heading: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16, textAlign: 'center' },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    // Emoji için yuvarlak yumuşak kutu (premium his).
    optionIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    optionBody: { flex: 1 },
    optionTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    optionDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
    optionChevron: { fontSize: 22, color: c.faint, fontWeight: '600' },

    formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary, marginBottom: 16 },
    headSpacer: { width: 44 },
  });
