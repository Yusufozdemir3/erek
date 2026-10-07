// The tab-switch animation. React Navigation's built-in "shift" is a 150 ms
// linear cross-fade with a 50 px nudge: halfway through both screens are half
// transparent and show through each other. This one slides each screen about a
// third of the width and fades the leaving one out in the first half and the
// arriving one in during the second, so the two never overlap.

import { Easing } from 'react-native';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

type Interpolator = NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>;
type Spec = NonNullable<BottomTabNavigationOptions['transitionSpec']>;

export const TAB_SLIDE_FRACTION = 0.3;
export const TAB_TRANSITION_MS = 260;

export const tabTransitionSpec: Spec = {
  animation: 'timing',
  config: { duration: TAB_TRANSITION_MS, easing: Easing.out(Easing.cubic) },
};

// progress: -1 = the screen sits to the left of the focused one, 0 = focused,
// 1 = to its right. Clamped, so a jump across several tabs doesn't overshoot.
export const makeTabInterpolator =
  (width: number): Interpolator =>
  ({ current }) => ({
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, -0.5, 0, 0.5, 1],
        outputRange: [0, 0, 1, 0, 0],
        extrapolate: 'clamp',
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width * TAB_SLIDE_FRACTION, 0, width * TAB_SLIDE_FRACTION],
            extrapolate: 'clamp',
          }),
        },
      ],
    },
  });
