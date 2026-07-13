// AmountStepper bileşen testi (nicel alışkanlık −/＋ sayacı + klavyeden giriş).
// Bu, "değer metnine dokun → klavyeden mutlak değer gir" deseninin regresyon
// ağıdır (aynı desen HabitTimer'a da taşındı). Erişim: providers (tema/dil).

import { fireEvent } from '@testing-library/react-native';
import { AmountStepper } from '@/ui/AmountStepper';
import { renderUI } from '@/test/renderWithProviders';

describe('AmountStepper', () => {
  it('mevcut ilerlemeyi "amount/target birim" olarak gösterir', async () => {
    const { getByText } = await renderUI(
      <AmountStepper amount={3} target={8} unit="bardak" onDec={jest.fn()} onInc={jest.fn()} onSet={jest.fn()} />
    );
    expect(getByText('3/8 bardak')).toBeTruthy();
  });

  it('＋ ve − düğmeleri onInc/onDec çağırır', async () => {
    const onInc = jest.fn();
    const onDec = jest.fn();
    const { getByLabelText } = await renderUI(
      <AmountStepper amount={3} target={8} unit={null} onDec={onDec} onInc={onInc} onSet={jest.fn()} />
    );
    fireEvent.press(getByLabelText('Miktarı artır'));
    fireEvent.press(getByLabelText('Miktarı azalt'));
    expect(onInc).toHaveBeenCalledTimes(1);
    expect(onDec).toHaveBeenCalledTimes(1);
  });

  it('değere dokununca klavye açılır; girilen mutlak değer onSet ile verilir', async () => {
    const onSet = jest.fn();
    const { getByText, getByDisplayValue } = await renderUI(
      <AmountStepper amount={3} target={8} unit={null} onDec={jest.fn()} onInc={jest.fn()} onSet={onSet} />
    );
    fireEvent.press(getByText('3/8')); // düzenleme moduna geç (mevcut değer '3')
    const input = getByDisplayValue('3');
    fireEvent.changeText(input, '5');
    fireEvent(input, 'submitEditing');
    expect(onSet).toHaveBeenCalledWith(5);
  });

  it('negatif giriş 0 ile sınırlanır', async () => {
    const onSet = jest.fn();
    const { getByText, getByDisplayValue } = await renderUI(
      <AmountStepper amount={2} target={8} unit={null} onDec={jest.fn()} onInc={jest.fn()} onSet={onSet} />
    );
    fireEvent.press(getByText('2/8'));
    const input = getByDisplayValue('2');
    fireEvent.changeText(input, '-4');
    fireEvent(input, 'submitEditing');
    expect(onSet).toHaveBeenCalledWith(0);
  });

  it('disabled iken düğmeler ve düzenleme çalışmaz', async () => {
    const onInc = jest.fn();
    const onSet = jest.fn();
    const { getByText, getByLabelText, queryByDisplayValue } = await renderUI(
      <AmountStepper amount={3} target={8} unit={null} onDec={jest.fn()} onInc={onInc} onSet={onSet} disabled />
    );
    fireEvent.press(getByLabelText('Miktarı artır'));
    fireEvent.press(getByText('3/8'));
    expect(onInc).not.toHaveBeenCalled();
    expect(queryByDisplayValue('3')).toBeNull(); // düzenleme açılmadı
    expect(onSet).not.toHaveBeenCalled();
  });
});
