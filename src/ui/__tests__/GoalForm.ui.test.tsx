// GoalForm component test — covers two features added in this session:
//  (1) Multiple reminders (remind_times) — several times via ReminderListEditor.
//  (2) The "Also add to progress history" checkbox for manually editing
//      "Current value" (log_manual_change) — OFF by default, only shown when
//      editing a numeric goal (see the file-header comment in GoalForm.tsx).
// It also covers type selection (numeric/milestone) and the required-deadline
// behavior (this component previously had no UI test at all).

import { fireEvent, act } from '@testing-library/react-native';
import { GoalForm } from '@/ui/GoalForm';
import { todayDate } from '@/lib/helpers';
import { renderUI } from '@/test/renderWithProviders';

async function pick(mode: 'date' | 'time', date: Date) {
  const cb = (globalThis as any).__pickers?.[mode];
  if (!cb) throw new Error(`"${mode}" seçici monte değil`);
  await act(async () => {
    cb(date);
  });
}

describe('GoalForm — oluşturma', () => {
  it('başlık boşsa gönderim yapılmaz', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(<GoalForm submitLabel="Ekle" onSubmit={onSubmit} />);
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('varsayılan tip sayısaldır; hedef değer/birim alanları görünür ve gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Kitap oku');
    fireEvent.changeText(getByPlaceholderText('örn. 100'), '100');
    fireEvent.changeText(getByPlaceholderText('km, kitap'), 'sayfa');
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_type: 'numeric',
        target_value: 100,
        unit: 'sayfa',
        deadline: todayDate(), // deadline is required, defaults to today
        current_value: null, // always null at creation
      })
    );
  });

  it('"Parçalı" seçilince hedef değer/birim gönderilmez, milestones taslağı girer', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={onSubmit} enableMilestoneDraft />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Ev taşı');
    fireEvent.press(getByText('Parçalı'));

    // The numeric fields are now GONE.
    expect(() => getByPlaceholderText('örn. 100')).toThrow();

    fireEvent.changeText(getByPlaceholderText('Adım ekle…'), 'Kutuları topla');
    fireEvent.press(getByText('＋'));
    fireEvent.press(getByText('Ekle'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_type: 'milestone',
        target_value: null,
        unit: null,
        start_date: null,
        // The draft milestone is no longer plain text but {title, amount, due date}:
        // the creation screen was brought in line with the milestone editor on the detail screen.
        milestones: [{ title: 'Kutuları topla', amount: null, due_date: null }],
      })
    );
  });

  it('sayısal hedefte taslak adıma miktar çipiyle eşik girilebilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByLabelText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={onSubmit} enableMilestoneDraft />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Kitap oku');
    fireEvent.changeText(getByPlaceholderText('örn. 100'), '100');
    fireEvent.changeText(getByPlaceholderText('km, kitap'), 'sayfa');

    // Chips don't show up before a title is typed (staged row).
    expect(() => getByLabelText('Miktar')).toThrow();
    fireEvent.changeText(getByPlaceholderText('Adım ekle…'), 'İlk 50 sayfa');
    fireEvent.press(getByLabelText('Miktar'));
    fireEvent.changeText(getByPlaceholderText('sayfa'), '50');
    fireEvent.press(getByText('＋'));
    fireEvent.press(getByText('Ekle'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: [{ title: 'İlk 50 sayfa', amount: 50, due_date: null }],
      })
    );
  });

  it('hatırlatma saati eklenince remind_times listesine girer', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Kitap oku');
    fireEvent.changeText(getByPlaceholderText('örn. 100'), '100');
    fireEvent.changeText(getByPlaceholderText('km, kitap'), 'sayfa');
    fireEvent.press(getByText('＋ Saat ekle'));
    await pick('time', new Date(2026, 0, 1, 8, 30));
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: ['08:30'] }));
  });

  it('hiç hatırlatma eklenmezse remind_times boş liste gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Hedef başlığı (örn. 100 km koş)'), 'Basit hedef');
    fireEvent.changeText(getByPlaceholderText('örn. 100'), '100');
    fireEvent.changeText(getByPlaceholderText('km, kitap'), 'sayfa');
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: [] }));
  });

  it('düzenleme dışında "Mevcut değer" ve onay kutusu hiç görünmez', async () => {
    const { queryByText, getByPlaceholderText } = await renderUI(
      <GoalForm submitLabel="Ekle" onSubmit={jest.fn()} />
    );
    expect(() => getByPlaceholderText('örn. 40')).toThrow(); // the "Current value" placeholder
    expect(queryByText('Bu değişikliği ilerleme geçmişine de ekle')).toBeNull();
  });
});

describe('GoalForm — düzenleme (sayısal, "Mevcut değer" + ilerleme geçmişi onay kutusu)', () => {
  const initial = {
    title: 'Kitap oku',
    target_value: 100,
    unit: 'sayfa',
    current_value: 40,
    deadline: '2026-03-10',
    remind_times: [] as string[],
    start_date: '2026-01-01',
  };

  it('onay kutusu VARSAYILAN kapalıdır — işaretlenmeden kaydedilirse log_manual_change=false', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <GoalForm goalType="numeric" initial={initial} submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    // Pull "Current value" to 55 — the checkbox is left untouched.
    fireEvent.changeText(getByPlaceholderText('örn. 40'), '55');
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ current_value: 55, log_manual_change: false })
    );
  });

  it('onay kutusu işaretlenince log_manual_change=true gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText, getByLabelText } = await renderUI(
      <GoalForm goalType="numeric" initial={initial} submitLabel="Kaydet" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('örn. 40'), '112');
    fireEvent.press(getByLabelText('Bu değişikliği ilerleme geçmişine de ekle'));
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ current_value: 112, log_manual_change: true })
    );
  });

  it('mevcut hatırlatmaları initial\'dan gösterir ve korur', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(
      <GoalForm
        goalType="numeric"
        initial={{ ...initial, remind_times: ['08:00', '20:00'] }}
        submitLabel="Kaydet"
        onSubmit={onSubmit}
      />
    );
    expect(getByText('08:00 ×')).toBeTruthy();
    expect(getByText('20:00 ×')).toBeTruthy();
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: ['08:00', '20:00'] }));
  });

  it('onDelete verilirse Sil düğmesi görünür ve iki basışla siler', async () => {
    const onDelete = jest.fn();
    const { getByText } = await renderUI(
      <GoalForm goalType="numeric" initial={initial} submitLabel="Kaydet" onSubmit={jest.fn()} onDelete={onDelete} />
    );
    fireEvent.press(getByText('Sil'));
    expect(onDelete).not.toHaveBeenCalled(); // the first press only arms confirmation
    fireEvent.press(getByText('Silmek için tekrar bas'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
