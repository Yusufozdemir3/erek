// HabitTimer bileşen testi — özellikle bu oturumda eklenen "süreyi el ile (dakika)
// girme" davranışı. TimerProvider (canlı sayaç motoru) mock'lanır; yalnız
// bileşenin kendi giriş/etkinlik mantığı sınanır.

import { fireEvent } from '@testing-library/react-native';
import { HabitTimer } from '@/ui/HabitTimer';
import { renderUI } from '@/test/renderWithProviders';

// useTimer'ı kontrol edilebilir bir dublörle değiştir. 'mock' önekli olduğundan
// jest.mock fabrikasında kullanılabilir (hoisting kısıtı).
const mockTimer = {
  isRunning: jest.fn<boolean, [string]>(() => false),
  liveSeconds: jest.fn<number | null, [string]>(() => null),
  start: jest.fn(),
  pause: jest.fn(),
  reset: jest.fn(),
};
jest.mock('@/ui/TimerProvider', () => ({ useTimer: () => mockTimer }));

describe('HabitTimer', () => {
  beforeEach(() => {
    mockTimer.isRunning.mockReturnValue(false);
    mockTimer.liveSeconds.mockReturnValue(null);
    jest.clearAllMocks();
    mockTimer.isRunning.mockReturnValue(false);
  });

  it('birikmiş süre / hedefi "d:ss / d:ss" gösterir', async () => {
    const { getByText } = await renderUI(
      <HabitTimer habitId="h1" amount={0} target={900} editable onSet={jest.fn()} />
    );
    expect(getByText('0:00 / 15:00')).toBeTruthy();
  });

  it('değere dokununca dakika girişi açılır ve saniyeye çevrilip onSet ile verilir', async () => {
    const onSet = jest.fn();
    const { getByText, getByDisplayValue } = await renderUI(
      <HabitTimer habitId="h1" amount={0} target={900} editable onSet={onSet} />
    );
    fireEvent.press(getByText('0:00 / 15:00')); // düzenleme moduna geç (mevcut '0' dk)
    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '15');
    fireEvent(input, 'submitEditing');
    expect(onSet).toHaveBeenCalledWith(900); // 15 dk = 900 sn
  });

  it('sayaç çalışırken el ile giriş açılmaz', async () => {
    mockTimer.isRunning.mockReturnValue(true);
    mockTimer.liveSeconds.mockReturnValue(120);
    const onSet = jest.fn();
    const { getByText, queryByDisplayValue } = await renderUI(
      <HabitTimer habitId="h1" amount={120} target={900} editable onSet={onSet} />
    );
    fireEvent.press(getByText('2:00 / 15:00'));
    expect(queryByDisplayValue('2')).toBeNull();
    expect(onSet).not.toHaveBeenCalled();
  });

  it('editable değilse (geçmiş gün) el ile giriş açılmaz', async () => {
    const onSet = jest.fn();
    const { getByText, queryByDisplayValue } = await renderUI(
      <HabitTimer habitId="h1" amount={0} target={900} editable={false} onSet={onSet} />
    );
    fireEvent.press(getByText('0:00 / 15:00'));
    expect(queryByDisplayValue('0')).toBeNull();
    expect(onSet).not.toHaveBeenCalled();
  });
});
