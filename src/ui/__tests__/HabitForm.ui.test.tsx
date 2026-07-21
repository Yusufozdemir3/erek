// HabitForm bileşen testi — bu formun daha önce hiç UI testi yoktu (en karmaşık
// paylaşılan form: sihirbaz modu, 4 sıklık kipi, 3 takip tipi, hedefe bağlama).
// Çoğu senaryo DÜZENLEME moduyla (stepped=false, kind sabit) test edilir — tüm
// alanlar tek seferde göründüğü için sihirbaz gezinmesi gerekmez (HabitEditModal
// deseni). Sihirbaz gezinmesi ayrıca iki testle (oluşturma, stepped=true) kapsanır.
// goalRepo.listByUser gerçek DB okuduğundan (hedefe bağlama alanı) resetTestDb
// kullanılır — TaskEditModal.ui.test.tsx ile aynı desen.

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
    jest.useFakeTimers().setSystemTime(new Date('2026-03-02T12:00:00')); // Pazartesi
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <HabitForm userId={userId} kind="binary" submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Alışkanlık başlığı'), 'Koşu');
    fireEvent.press(getByText('Belirli günler')); // bugün (Pzt) otomatik seçili gelir
    fireEvent.press(getByText('Çar')); // Çarşamba'yı da ekle
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
    fireEvent.changeText(getByDisplayValue('2'), '3'); // varsayılan "2" metin kutusu
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
    fireEvent.changeText(getByDisplayValue('3'), '4'); // varsayılan "3" metin kutusu
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
    // "Kaç bardak bir litre eder?" — 4 bardak = 1 litre → goal_factor = 1/4 = 0.25 (matematiksel ters).
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
    // İlk adım: tip kartları. "İleri" düğmesi disabled (kind seçilmeden).
    fireEvent.press(getByText('İleri'));
    expect(getByText('Basit (tik)')).toBeTruthy(); // hâlâ tip adımındayız
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
    fireEvent.press(getByText('İleri')); // -> reminder (binary + hedefsiz: tracking adımı yok)
    expect(getByText('Ekle')).toBeTruthy(); // son adım
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erken kalk', kind: 'binary' }));
  });
});
