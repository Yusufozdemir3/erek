// GoalForm bileşen testi — bu oturumda eklenen iki özelliği kapsar:
//  (1) Çoklu hatırlatma (remind_times) — ReminderListEditor ile birden fazla saat.
//  (2) "Mevcut değer" elle düzenlemesi için "İlerleme geçmişine de ekle" onay
//      kutusu (log_manual_change) — varsayılan KAPALI, yalnız düzenleme + sayısal
//      hedefte görünür (bkz. GoalForm.tsx dosya başı yorumu).
// Ayrıca tip seçimi (sayısal/parçalı) ve zorunlu son tarih davranışını da kapsar
// (bu bileşenin daha önce hiç UI testi yoktu).

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
        deadline: todayDate(), // zorunlu son tarih, varsayılan bugün
        current_value: null, // oluşturmada hep null
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

    // Sayısal alanlar artık YOK.
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
        milestones: ['Kutuları topla'],
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
    expect(() => getByPlaceholderText('örn. 40')).toThrow(); // "Mevcut değer" placeholder'ı
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
    // "Mevcut değer"i 55'e çek — onay kutusuna dokunulmadı.
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
    expect(onDelete).not.toHaveBeenCalled(); // ilk basış yalnızca onaya alır
    fireEvent.press(getByText('Silmek için tekrar bas'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
