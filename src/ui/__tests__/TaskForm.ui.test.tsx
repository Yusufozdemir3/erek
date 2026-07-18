// TaskForm bileşen testi — bu oturumun iki özelliğini kapsar:
//  (1) Son tarih ZORUNLU: oluşturmada varsayılan bugün, "Temizle" ile kaldırılamaz.
//  (2) Saat isteğe bağlı: seçilince due_date'e gömülür; bitiş saati başlangıçtan
//      SONRA ise geçerli. Tarih/saat seçici (DateTimePicker) setup-ui'de dublörlenir;
//      seçim `global.__pickers.date/time(...)` ile simüle edilir.

import { fireEvent, act } from '@testing-library/react-native';
import { TaskForm } from '@/ui/TaskForm';
import { todayDate } from '@/lib/helpers';
import { renderUI } from '@/test/renderWithProviders';

// Dublör seçicinin onChange'ini çağırıp bekleyen state'i boşaltır.
async function pick(mode: 'date' | 'time', date: Date) {
  const cb = (globalThis as any).__pickers?.[mode];
  if (!cb) throw new Error(`"${mode}" seçici monte değil`);
  await act(async () => {
    cb({ type: 'set' }, date);
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
        due_date: todayDate(), // saatsiz, tam bugün
        end_time: null,
      })
    );
  });

  it('son tarih için "Temizle" düğmesi yoktur (tarih kaldırılamaz)', async () => {
    const { queryByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} />
    );
    // Henüz saat seçilmediğinden ekranda hiç "Temizle" bulunmamalı — bu, tarihin
    // (varsayılan bugün) kaldırılamaz olduğunu dolaylı doğrular.
    expect(getByPlaceholderText('Görev başlığı')).toBeTruthy();
    expect(queryByText('Temizle')).toBeNull();
  });

  it('saat seçilince due_date içine gömülür', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Toplantı');
    fireEvent.press(getByText('Saat yok')); // saat seçiciyi aç
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
    // Başlangıç saati 09:30
    fireEvent.press(getByText('Saat yok'));
    await pick('time', new Date(2026, 0, 1, 9, 30));
    // Bitiş saati alanı artık görünür (başlangıç varken). Kalan "Saat yok" bitiştir.
    fireEvent.press(getByText('Saat yok'));
    await pick('time', new Date(2026, 0, 1, 10, 0)); // 10:00 > 09:30 → geçerli
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

  // Hatırlatma saati son tarihin kendi saatinden AYRI: kendi seçicisiyle set
  // edilir, remind_at olarak gönderilir. Boşken "Hatırlatma yok" der (son tarih
  // saatinin "Saat yok"undan ayrı etiket).
  it('hatırlatma saati seçilince remind_at olarak gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'İlaç al');
    fireEvent.press(getByText('Hatırlatma yok')); // hatırlatma seçicisini aç
    await pick('time', new Date(2026, 0, 1, 8, 0));
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_at: '08:00' }));
  });

  it('hatırlatma seçilmezse remind_at null gönderilir', async () => {
    const onSubmit = jest.fn();
    const { getByText, getByPlaceholderText } = await renderUI(
      <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
    );
    fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Basit görev');
    fireEvent.press(getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ remind_at: null }));
  });

  // Altı tekrar seçeneği formu kalabalıklaştırdığı için kapalı duruyor: düğme
  // yalnız seçili kipi gösterir, dokununca liste açılır, seçince tekrar kapanır.
  describe('tekrar seçici', () => {
    it('seçenekler kapalı başlar, düğme seçili kipi gösterir', async () => {
      const { getByText, queryByText } = await renderUI(
        <TaskForm submitLabel="Ekle" onSubmit={jest.fn()} />
      );
      expect(getByText('Tekrar yok')).toBeTruthy(); // özet düğmesi
      expect(queryByText('Her gün')).toBeNull(); // liste kapalı
    });

    it('düğmeye basınca açılır, kip seçilince kapanır ve özet güncellenir', async () => {
      const onSubmit = jest.fn();
      const { getByText, queryByText, getByPlaceholderText } = await renderUI(
        <TaskForm submitLabel="Ekle" onSubmit={onSubmit} />
      );
      fireEvent.press(getByText('Tekrar yok'));
      fireEvent.press(getByText('Her gün')); // artık görünür → seç
      expect(queryByText('Tekrar yok')).toBeNull(); // liste kapandı, özet değişti
      expect(getByText('Her gün')).toBeTruthy(); // özet düğmesi

      fireEvent.changeText(getByPlaceholderText('Görev başlığı'), 'Su iç');
      fireEvent.press(getByText('Ekle'));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: expect.objectContaining({ freq: 'daily' }) })
      );
    });
  });
});
