// Gives every <Text> and <TextInput> in the app the typeface the user picked
// (fontStore.ts) instead of the phone's system font. React Native has no
// global "default font", and ~270 styles already say fontWeight, so the render
// of the two components is wrapped once: if a style has no fontFamily of its
// own, the family file for its fontWeight is added (and fontWeight reset, or
// Android would fake-bold an already-bold file). Icon fonts and the font
// preview rows set their own fontFamily and are left alone. Each Text
// subscribes to the choice, so switching repaints the whole app live.
// Call applyAppFont() once, before the first render.

import { StyleSheet, Text, TextInput, type TextStyle } from 'react-native';
import { fontFamilyFor } from './fontFamily';
import { useFontChoice } from './fontStore';

type Renderable = { render?: (props: { style?: unknown }, ref: unknown) => unknown };

let applied = false;

export function applyAppFont(): void {
  if (applied) return;
  applied = true;
  for (const component of [Text, TextInput]) {
    const target = component as unknown as Renderable;
    const original = target.render;
    if (typeof original !== 'function') continue;
    // This function IS the component's render, so hooks are allowed here.
    target.render = function patched(this: unknown, props, ref) {
      const choice = useFontChoice();
      const flat = StyleSheet.flatten(props.style as TextStyle) as TextStyle | undefined;
      const family = flat?.fontFamily ? undefined : fontFamilyFor(choice, flat?.fontWeight);
      if (!family) return original.call(this, props, ref);
      const font: TextStyle = { fontFamily: family, fontWeight: 'normal' };
      return original.call(this, { ...props, style: [props.style, font] }, ref);
    };
  }
}
