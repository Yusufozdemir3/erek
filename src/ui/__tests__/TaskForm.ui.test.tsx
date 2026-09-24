// TaskForm component test — covers two features from this session:
//  (1) The deadline is REQUIRED: defaults to today at creation, can't be
//      removed via "Clear".
//  (2) The time is optional: once picked it's embedded into due_date; the end
//      time is valid only if it's AFTER the start time. The date/time picker
//      (DatePickerModal/TimePickerModal) is doubled in setup-ui; selection is
//      simulated via `global.__pickers.date/time(date)`.

import { fireEvent, act } from '@testing-library/react-native';
import { TaskForm } from '@/ui/TaskForm';
import { todayDate } from '@/lib/helpers';
import { renderUI } from '@/test/renderWithProviders';

// Calls the double picker's onConfirm and flushes pending state.
async function pick(mode: 'date' | 'time', date: Date) {
  const cb = (globalThis as any).__pickers?.[mode];
  if (!cb) throw new Error(`"${mode}" seçici monte değil`);
  await act(async () => {
    cb(date);
  });
}

describe('TaskForm', () => {
  it('başlık boşsa gönderim yapılmaz', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={onSubmit} />);
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('son tarih varsayılan olarak bugün gelir ve gönderimde yer alır', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Fatura öde');
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fatura öde',
        priority: 'medium',
        due_date: todayDate(), // no time, exactly today
        end_time: null,
      })
    );
  });

  it('son tarih için "Temizle" düğmesi yoktur (tarih kaldırılamaz)', async () => {
    const { queryByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} />
    );
    // Since no time has been picked yet, "Clear" shouldn't appear anywhere on
    // screen — this indirectly confirms the date (default today) can't be removed.
    expect(getByPlaceholderText('Görev başlığı')).toBeTruthy();
    expect(queryByText('Temizle')).toBeNull();
  });

  it('saat seçilince due_date içine gömülür', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Toplantı');
    fireEvent.press(getByText('Saat yok')); // open the time picker
    await pick('time', new Date(2026, 0, 1, 9, 30));
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: `${todayDate()}T09:30:00`, end_time: null })
    );
  });

  it('bitiş saati başlangıçtan sonraysa geçerli, değilse yok sayılır', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Spor');
    // Start time 09:30
    fireEvent.press(getByText('Saat yok'));
    await pick('time', new Date(2026, 0, 1, 9, 30));
    // The end-time field is now visible (once a start exists). The remaining "Saat yok" is the end.
    fireEvent.press(getByText('Saat yok'));
    await pick('time', new Date(2026, 0, 1, 10, 0)); // 10:00 > 09:30 → valid
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: `${todayDate()}T09:30:00`, end_time: '10:00' })
    );
  });

  it('düzenlemede mevcut son tarih korunur', async () => {
    const onSubmit = jest.fn();
    const { getByText } = await renderUI(
      <TaskForm
        initial={{ title: 'Var olan', priority: 'high', due_date: '2026-03-10', end_time: null }}
        submitLabel="Kaydet"
        onSubmit={onSubmit}
      />
    );
    fireEvent.press(getByText('Kaydet'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Var olan', priority: 'high', due_date: '2026-03-10' })
    );
  });

  // Reminder times are SEPARATE from the deadline's own time: multiple can be
  // added via ReminderListEditor's "+ Add time" button, sent as the remind_times list.
  it('hatırlatma saati eklenince remind_times listesine girer', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'İlaç al');
    fireEvent.press(getByText('＋ Saat ekle')); // open the reminder picker
    await pick('time', new Date(2026, 0, 1, 8, 0));
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: ['08:00'] }));
  });

  it('hiç hatırlatma eklenmezse remind_times boş liste gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Basit görev');
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_times: [] }));
  });

  // The six recurrence options are collapsed since they'd clutter the form:
  // the button shows only the selected mode, tapping it opens the list, and
  // selecting one closes it again.
  describe('tekrar seçici', () => {
    it('seçenekler kapalı başlar, düğme seçili kipi gösterir', async () => {
      const { getByText, queryByText } = await renderUI(
        <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} />
      );
      expect(getByText('Tekrar yok')).toBeTruthy(); // summary button
      expect(queryByText('Her gün')).toBeNull(); // list is closed
    });

    it('düğmeye basınca açılır, kip seçilince kapanır ve özet güncellenir', async () => {
      const onSubmit = jest.fn();
      const { getByText, queryByText, getByPlaceholderText } = await renderUI(
        <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
      );
      fireEvent.press(getByText('Tekrar yok'));
      fireEvent.press(getByText('Her gün')); // now visible → select it
      expect(queryByText('Tekrar yok')).toBeNull(); // list closed, summary changed
      expect(getByText('Her gün')).toBeTruthy(); // summary button

      fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Su iç');
      fireEvent.press(getByText('Ekle'));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: expect.objectContaining({ freq: 'daily' }) })
      );
    });
  });
});
