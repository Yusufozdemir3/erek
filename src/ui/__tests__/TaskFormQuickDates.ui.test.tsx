// Görev formunda hızlı tarih düğmeleri: Bugün / Yarın / Haftaya.

import { fireEvent } from '@testing-library/react-native';
import { TaskForm } from '@/ui/TaskForm';
import { shiftYmd, todayDate } from '@/lib/helpers';
import { renderUI } from '@/test/renderWithProviders';

describe('TaskForm hızlı tarihler', () => {
  it('varsayılan bugün seçili; Yarın ve Haftaya tarihi değiştirir ve gönderime yansır', async () => {
    const onSubmit = jest.fn();
    const u = await renderUI(<TaskForm submitLabel="Ekle" onSubmit={onSubmit} />);
    expect(u.getByLabelText('Bugün').props.accessibilityState.selected).toBe(true);

    fireEvent.press(u.getByLabelText('Yarın'));
    expect(u.getByLabelText('Yarın').props.accessibilityState.selected).toBe(true);
    expect(u.getByLabelText('Bugün').props.accessibilityState.selected).toBe(false);

    fireEvent.changeText(u.getByPlaceholderText('Görev başlığı'), 'Fatura öde');
    fireEvent.press(u.getByText('Ekle'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ due_date: shiftYmd(todayDate(), 1) }));

    fireEvent.press(u.getByLabelText('Haftaya'));
    fireEvent.press(u.getByText('Ekle'));
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ due_date: shiftYmd(todayDate(), 7) }));
  });

  it('başka bir tarihli görevde hiçbir düğme seçili görünmez', async () => {
    const u = await renderUI(
      <TaskForm
        submitLabel="Kaydet"
        onSubmit={jest.fn()}
        initial={{ title: 'Eski', priority: 'low', due_date: '2020-01-01', end_time: null, remind_times: [] } as never}
      />
    );
    for (const l of ['Bugün', 'Yarın', 'Haftaya']) {
      expect(u.getByLabelText(l).props.accessibilityState.selected).toBe(false);
    }
  });
});

describe('shiftYmd', () => {
  it('ay ve yıl sınırlarını geçer', () => {
    expect(shiftYmd('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftYmd('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftYmd('2026-03-01', -1)).toBe('2026-02-28');
  });
});
