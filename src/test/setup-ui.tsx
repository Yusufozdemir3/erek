// Stand-ins for native modules in UI tests:
// - DatePickerModal / TimePickerModal render nothing; while open they register
//   onConfirm on global.__pickers, so tests pick with __pickers.date(d) / .time(d);
// - haptics: no-op; expo-localization: pinned to 'tr';
// - @expo/vector-icons: render nothing (their font loader throws under jest;
//   accessibility labels live on the wrapping Pressable).

// jest.mock factories can't share outer variables, so each repeats the registration.
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

// useSafeAreaInsets throws outside a SafeAreaProvider; the package's own mock gives zero insets.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@/lib/haptics', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
  notifySuccess: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const Icon = () => null;
  return { Feather: Icon, Ionicons: Icon };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr' }],
}));

// Speech recognizer (native-only module, throws on import under jest): a
// device WITHOUT a recognizer, so the mic stays hidden. Voice-flow tests mock
// '@/lib/voice' themselves (see TaskFormVoice.ui.test.tsx).
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => false,
    supportsOnDeviceRecognition: () => false,
    getSupportedLocales: async () => ({ locales: [], installedLocales: [] }),
    getMicrophonePermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestMicrophonePermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    androidTriggerOfflineModelDownload: async () => ({ status: 'download_canceled', message: '' }),
    start: () => {},
    stop: () => {},
    abort: () => {},
  },
  useSpeechRecognitionEvent: () => {},
}));

// App lock (native-only modules): a phone with NO screen lock, so the lock stays
// off unless a test mocks these itself (see AppLock.ui.test.tsx).
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: async () => 0,
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({ success: false, error: 'not_enrolled' }),
}));
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: async () => {},
  allowScreenCaptureAsync: async () => {},
}));

// Document picker (native): cancels unless a test mocks it itself (see ProfileImport.ui.test.tsx).
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true, assets: null }),
}));

afterEach(() => {
  const g = globalThis as any;
  g.__pickers = {};
});
