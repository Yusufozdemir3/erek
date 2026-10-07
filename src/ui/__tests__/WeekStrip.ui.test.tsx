// Hafta şeridi: bir güne dokunmak seçer; yana kaydırmak bir hafta götürür.

import { act, fireEvent } from '@testing-library/react-native';
import { WeekStrip } from '../WeekStrip';
import { renderUI } from '@/test/renderWithProviders';
import { lightColors } from '../theme';

const props = { selectedDate: '2026-10-07', today: '2026-10-07', lang: 'tr' as const, colors: lightColors };

describe('WeekStrip', () => {
  it('bir güne dokununca onSelect çağrılır', async () => {
    const onSelect = jest.fn();
    const u = await renderUI(<WeekStrip {...props} onSelect={onSelect} />);
    fireEvent.press(u.getByText('9'));
    expect(onSelect).toHaveBeenCalledWith('2026-10-09');
  });

  it('yatay kaydırma bir hafta ileri/geri götürür', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();
    const u = await renderUI(<WeekStrip {...props} onSelect={onSelect} />);
    const strip = u.UNSAFE_root.findAll((n: { props: Record<string, unknown> }) => typeof n.props.onResponderRelease === 'function')[0];
    const pan = (dx: number) => {
      const h = strip.props;
      const ev = (x: number) => ({
        nativeEvent: { pageX: x, pageY: 0, touches: [{ pageX: x, pageY: 0 }], changedTouches: [{ pageX: x, pageY: 0 }], identifier: 1, timestamp: Date.now() },
        touchHistory: {
          indexOfSingleActiveTouch: 0,
          mostRecentTimeStamp: Date.now(),
          numberActiveTouches: 1,
          touchBank: [{ touchActive: true, startPageX: 200, startPageY: 0, startTimeStamp: 0, currentPageX: x, currentPageY: 0, currentTimeStamp: Date.now(), previousPageX: 200, previousPageY: 0, previousTimeStamp: 0 }],
        },
      });
      act(() => {
        h.onStartShouldSetResponder?.(ev(200));
        h.onResponderGrant?.(ev(200));
        h.onResponderMove?.(ev(200 + dx));
        h.onResponderRelease?.(ev(200 + dx));
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });
    };
    pan(-120);
    expect(onSelect).toHaveBeenLastCalledWith('2026-10-14');
    pan(120);
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-30');
    jest.useRealTimers();
  });
});
