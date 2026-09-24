// Shared setup for UI (component) tests: test stand-ins for the native
// modules that components running on react-test-renderer need.
//
// - @/ui/DatePickerModal, @/ui/TimePickerModal: custom calendar/wheel pickers
//   (replacing the native @react-native-community/datetimepicker). In tests
//   they're replaced with a stand-in that renders nothing but, while open,
//   registers its onConfirm callback on global.__pickers. Tests simulate a
//   date/time pick by calling `global.__pickers.date(date)` / `.time(date)`.
// - @/lib/haptics: haptic feedback (expo-haptics) — a silent no-op in tests.
// - expo-localization: the device language is pinned (tr) so i18n is deterministic.
// - @expo/vector-icons: loads its glyph font via expo-font; throws in the jest
//   environment since there's no native module ("loadedNativeFonts.forEach is
//   not a function"). Icons are purely visual (accessibility labels live on
//   the Pressable wrapping them), so they're replaced with a stand-in that renders nothing.

import '@testing-library/react-native/extend-expect';

// Stand-ins that register onConfirm on global.__pickers, keyed by mode, while open.
// Since jest.mock factories can't access outer-scope variables (a hoisting
// restriction), each one repeats its own registration logic.
jest.mock('@/ui/DatePickerModal', () => ({
  DatePickerModal: (props: any) => {
    const g = globalThis as any;
    g.__pickers = g.__pickers || {};
    if (props.visible) g.__pickers.date = props.onConfirm;
    return null;
  },
}));
jest.mock('@/ui/TimePickerModal', () => ({
  TimePickerModal: (props: any) => {
    const g = globalThis as any;
    g.__pickers = g.__pickers || {};
    if (props.visible) g.__pickers.time = props.onConfirm;
    return null;
  },
}));

// Haptics is a pure side effect; meaningless in tests, swallow it silently.
jest.mock('@/lib/haptics', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
  notifySuccess: jest.fn(),
}));

// Vector icons: a stand-in that renders nothing (see the file header).
jest.mock('@expo/vector-icons', () => {
  const Icon = () => null;
  return { Feather: Icon, Ionicons: Icon };
});

// Pin the device language (tr) — so the i18n default is deterministic.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr' }],
}));

afterEach(() => {
  const g = globalThis as any;
  g.__pickers = {};
});
