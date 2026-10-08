// TaskForm: the date is required (today by default), the time optional and
// embedded in due_date, an end time only after the start, reminders, recurrence.
// Pickers are doubled in setup-ui (global.__pickers).

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
    // No "Clear" anywhere: the date can't be removed.
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
    const { getByText, getByPlaceholderText, getByLabelText, queryByLabelText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Spor');
    expect(queryByLabelText('Bitiş: Saat yok')).toBeNull(); // no end without a start
    // Start time 09:30
    fireEvent.press(getByText('Saat yok'));
    await pick('time', new Date(2026, 0, 1, 9, 30));
    // The end-time field is now visible, beside the start.
    fireEvent.press(getByLabelText('Bitiş: Saat yok'));
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

  // Reminders are separate from the due time.
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

  // The recurrence list opens from its button and closes on a pick.
  describe('tekrar seçici', () => {
    // The picker is a window; the form shows a one-line summary.
    const open = (u: Awaited<ReturnType<typeof renderUI>>, summary: string) =>
      fireEvent.press(u.getByLabelText(`Tekrar: ${summary}`));
    const pickMode = (u: Awaited<ReturnType<typeof renderUI>>, label: string) =>
      fireEvent.press(u.getAllByRole('radio').find((r) => r.props.accessibilityLabel === label)!);

    it('pencere kapalı başlar; özet "Tekrar yok" der', async () => {
      const u = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={jest.fn()} />);
      expect(u.getByLabelText('Tekrar: Tekrar yok')).toBeTruthy();
      expect(u.queryByText('Birkaç günde bir')).toBeNull();
    });

    it('kip seçilince pencere açık kalır; Tamam kapatır, özet ve kayıt güncellenir', async () => {
      const onSubmit = jest.fn();
      const u = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={onSubmit} />);
      open(u, 'Tekrar yok');
      expect(u.getAllByRole('radio')).toHaveLength(6); // eşit satırlı tek liste
      pickMode(u, 'Her gün');
      expect(u.getByText('Birkaç günde bir')).toBeTruthy(); // hâlâ açık
      fireEvent.press(u.getByText('Tamam'));
      expect(u.queryByText('Birkaç günde bir')).toBeNull();
      expect(u.getByLabelText('Tekrar: Her gün')).toBeTruthy();

      fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Su iç');
      fireEvent.press(u.getByText('Ekle'));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurrence: { freq: 'daily' } }));
    });

    it('belirli günler: bugünle başlar, gün eklenir; özet günleri sayar', async () => {
      const today = new Date().getDay();
      const extra = today === 1 ? 3 : 1; // bugün Pazartesiyse Çarşamba ekle
      const extraLabel = extra === 1 ? 'Pzt' : 'Çar';
      const onSubmit = jest.fn();
      const u = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={onSubmit} />);
      open(u, 'Tekrar yok');
      pickMode(u, 'Belirli günler');
      fireEvent.press(u.getByLabelText(extraLabel));
      fireEvent.press(u.getByText('Tamam'));
      expect(u.getByLabelText(new RegExp(`^Tekrar: .*${extraLabel}`))).toBeTruthy();

      fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Spor');
      fireEvent.press(u.getByText('Ekle'));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: { freq: 'weekly', weekdays: [today, extra].sort((a, b) => a - b) } })
      );
    });

    it('birkaç günde bir ve ayın günü: sayı alanı seçilen satırın altında', async () => {
      const onSubmit = jest.fn();
      const u = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={onSubmit} />);
      open(u, 'Tekrar yok');
      pickMode(u, 'Birkaç günde bir');
      fireEvent.changeText(u.getByLabelText('Kaç günde bir?'), '3');
      fireEvent.press(u.getByText('Tamam'));
      expect(u.getByLabelText('Tekrar: 3 günde bir')).toBeTruthy();

      open(u, '3 günde bir');
      pickMode(u, 'Her ay');
      expect(u.queryByLabelText('Kaç günde bir?')).toBeNull(); // yalnız seçili kipin ayarı
      fireEvent.changeText(u.getByLabelText('Ayın günü:'), '15');
      fireEvent.press(u.getByText('Tamam'));
      expect(u.getByLabelText('Tekrar: Her ayın 15. günü')).toBeTruthy();

      fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Kira');
      fireEvent.press(u.getByText('Ekle'));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recurrence: { freq: 'monthly', monthDay: 15 } }));
    });
  });
});
