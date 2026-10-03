// Konfeti: "animasyonları kaldır" ayarı açıkken hiçbir şey çizilmez.

import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Confetti } from '@/ui/Confetti';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => () => 0, quad: () => 0 },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withDelay: (_: number, v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

let reduce = false;
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => reduce);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
});
afterEach(() => jest.restoreAllMocks());

// 30 pieces + the wrapper when a burst is on screen.
const drawn = (u: ReturnType<typeof render>) => u.toJSON() !== null;

describe('Confetti', () => {
  it('burstId 0: hiçbir şey çizilmez', async () => {
    reduce = false;
    const u = render(<Confetti burstId={0} />);
    await act(async () => {});
    expect(drawn(u)).toBe(false);
  });

  it('burst gelince çizilir', async () => {
    reduce = false;
    const u = render(<Confetti burstId={0} />);
    await act(async () => {});
    u.rerender(<Confetti burstId={1} />);
    await act(async () => {});
    expect(drawn(u)).toBe(true);
  });

  it('animasyonları kaldır açıkken burst gelse de çizilmez', async () => {
    reduce = true;
    const u = render(<Confetti burstId={0} />);
    await act(async () => {});
    u.rerender(<Confetti burstId={1} />);
    await act(async () => {});
    expect(drawn(u)).toBe(false);
  });
});
