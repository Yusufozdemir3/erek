// HabitTimer component test — especially the "enter duration manually (in
// minutes)" behavior added in this session. TimerProvider (the live timer
// engine) is mocked; only the component's own input/interaction logic is tested.

import { fireEvent } from '@testing-library/react-native';
import { HabitTimer } from '@/ui/HabitTimer';
import { renderUI } from '@/test/renderWithProviders';

// Replace useTimer with a controllable double. Since it's prefixed with
// 'mock', it can be used inside the jest.mock factory (hoisting restriction).
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
    fireEvent.press(getByText('0:00 / 15:00')); // switch to edit mode (currently '0' min)
    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '15');
    fireEvent(input, 'submitEditing');
    expect(onSet).toHaveBeenCalledWith(900); // 15 min = 900 sec
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
