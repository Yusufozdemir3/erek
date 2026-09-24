// HabitForm component test — this form previously had no UI test at all (the
// most complex shared form: wizard mode, 4 frequency modes, 3 tracking types,
// linking to a goal). Most scenarios are tested in EDIT mode (stepped=false,
// fixed kind) — since all fields show at once, no wizard navigation is needed
// (the HabitEditModal pattern). Wizard navigation is separately covered by
// two tests (creation, stepped=true). Since goalRepo.listByUser reads the
// real DB (the goal-linking field), resetTestDb is used — same pattern as
// TaskEditModal.ui.test.tsx.

import { fireEvent, act } from '@testing-library/react-native';
import { goalRepo, habitRepo, userRepo } from '@/db';
import { HabitForm } from '@/ui/HabitForm';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';

async function pick(mode: 'date' | 'time', date: Date) {
  const cb = (globalThis as any).__pickers?.[mode];
  if (!cb) throw new Error(`"${mode}" seçici monte değil`);
  await act(async () => {
    cb(date);
  });
}

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  userId = userRepo.getOrCreateLocal().id;
});

describe('HabitForm — düzenleme modu (stepped=false), ikili (binary)', () => {
  it('başlık boşsa gönderim yapılmaz', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('varsayılan sıklık her gündür — schedule null gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Su iç');
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: null, kind: 'binary' }));
  });

  it('hatırlatma saati eklenince remind_times listesine girer', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Su iç');
    fireEvent.press(getByText('＋ Saat ekle'));
    await pick('time', new Date(2026, 0, 1, 9, 0));
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: ['09:00'] }));
  });

  it('belirli günler seçilince haftalık Recurrence üretir (bugün Pazartesi sabitlendi)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-02T12:00:00')); // Monday
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Koşu');
    fireEvent.press(getByText('Belirli günler')); // today (Mon) comes pre-selected automatically
    fireEvent.press(getByText('Çar')); // also add Wednesday
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { freq: 'weekly', weekdays: [1, 3] } })
    );
    jest.useRealTimers();
  });

  it('"X günde bir" seçilince interval Recurrence üretir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByDisplayValue, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Yüzme');
    fireEvent.press(getByText('X günde bir'));
    fireEvent.changeText(getByDisplayValue('2'), '3'); // default "2" text box
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: expect.objectContaining({ freq: 'interval', every: 3 }) })
    );
  });

  it('"Haftada X kez" seçilince quota Recurrence üretir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByDisplayValue, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Spor salonu');
    fireEvent.press(getByText('Haftada X kez'));
    fireEvent.changeText(getByDisplayValue('3'), '4'); // default "3" text box
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ schedule: { freq: 'weekly', timesPerWeek: 4 } })
    );
  });

  it('onDelete verilirse Sil düğmesi görünür ve iki basışla siler', async () => {
    const onDelete = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={jest.fn()} onDelete={onDelete} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'X');
    fireEvent.press(getByText('Sil'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.press(getByText('Silmek için tekrar bas'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('HabitForm — nicel (numeric) ve zamanlayıcı (timer)', () => {
  it('nicel: günlük hedef + birim gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="numeric" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Su iç');
    fireEvent.changeText(getByPlaceholderText('örn. 8'), '8');
    fireEvent.changeText(getByPlaceholderText('birim (bardak)'), 'bardak');
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'numeric', target_amount: 8, unit: 'bardak' })
    );
  });

  it('zamanlayıcı: dakika olarak girilir, saniyeye çevrilip gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="timer" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Meditasyon');
    fireEvent.changeText(getByPlaceholderText('örn. 20'), '20');
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'timer', target_amount: 1200 }) // 20*60
    );
  });
});

describe('HabitForm — hedefe bağlama', () => {
  it('sayısal hedefler listelenir, seçilince goal_id gönderilir (varsayılan katkı: gün başına +1)', async () => {
    const goal = goalRepo.create({ user_id: userId, title: 'Kitap oku', goal_type: 'numeric', target_value: 100, unit: 'sayfa' });
    const onSubmit = jest.fn();
    const { getByText, findByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="numeric" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Sayfa oku');
    fireEvent.changeText(getByPlaceholderText('örn. 8'), '5');
    fireEvent.changeText(getByPlaceholderText('birim (bardak)'), 'sayfa');
    fireEvent.press(await findByText(`🎯 ${goal.title}`));
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: goal.id, goal_contribution: 'per_completion' })
    );
  });

  it('milestone (parçalı) hedefler bağlama listesinde GÖRÜNMEZ — yalnız sayısal hedefler', async () => {
    goalRepo.create({ user_id: userId, title: 'Ev taşı', goal_type: 'milestone' });
    const { queryByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={jest.fn()} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'X');
    await act(async () => {});
    expect(queryByText('🎯 Ev taşı')).toBeNull();
  });

  it('"Yaptığım miktar" katkı biçimi seçilince oran girilir ve goal_factor tersine çevrilir', async () => {
    const goal = goalRepo.create({ user_id: userId, title: 'Su litresi', goal_type: 'numeric', target_value: 50, unit: 'litre' });
    const onSubmit = jest.fn();
    const { getByText, findByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="numeric" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Bardak su');
    fireEvent.changeText(getByPlaceholderText('örn. 8'), '2');
    fireEvent.press(await findByText(`🎯 ${goal.title}`));
    fireEvent.press(getByText('Yaptığım miktar'));
    fireEvent.changeText(getByPlaceholderText('birim (bardak)'), 'bardak');
    // "How many cups make a liter?" — 4 cups = 1 liter → goal_factor = 1/4 = 0.25 (the mathematical inverse).
    fireEvent.changeText(getByPlaceholderText('1'), '4');
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ goal_id: goal.id, goal_contribution: 'amount', goal_factor: 0.25 })
    );
  });
});

describe('HabitForm — sihirbaz modu (stepped=true, oluşturma)', () => {
  it('tip seçilmeden İleri devre dışıdır', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(
      <HabitForm userId={userId} submitLabel="Ekle" stepped onSubmit={onSubmit} />
    );
    // First step: type cards. The "Next" button is disabled (no kind selected yet).
    fireEvent.press(getByText('İleri'));
    expect(getByText('Basit (tik)')).toBeTruthy(); // still on the type step
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('tip seçilip tüm adımlar geçilince son adımda submitLabel görünür ve gönderir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} submitLabel="Ekle" stepped onSubmit={onSubmit} autoFocusTitle />
    );
    fireEvent.press(getByText('Basit (tik)')); // kind: binary
    fireEvent.press(getByText('İleri')); // -> identity
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Erken kalk');
    fireEvent.press(getByText('İleri')); // -> schedule
    fireEvent.press(getByText('İleri')); // -> reminder (binary + goalless: no tracking step)
    expect(getByText('Ekle')).toBeTruthy(); // last step
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erken kalk', kind: 'binary' }));
  });
});
