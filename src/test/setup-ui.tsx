// UI (bileşen) testleri için ortak kurulum: react-test-renderer üzerinde çalışan
// bileşenlerin ihtiyaç duyduğu native modüllerin test dublörleri.
//
// - @react-native-community/datetimepicker: gerçek seçici native; testte hiçbir
//   şey çizmeyen ama onChange geri çağrısını mode'a göre global.__pickers'a kaydeden
//   bir dublörle değiştirilir. Test, tarih/saat seçimini `global.__pickers.date(...)`
//   / `.time(...)` çağırarak simüle eder.
// - @/lib/haptics: dokunsal geri bildirim (expo-haptics) — testte sessiz no-op.
// - expo-localization: cihaz dili sabitlenir (tr) ki i18n deterministik olsun.
// - @expo/vector-icons: glif fontunu expo-font ile yükler; jest ortamında native
//   modül olmadığı için patlar ("loadedNativeFonts.forEach is not a function").
//   İkonlar salt görsel (erişilebilirlik etiketleri onları saran Pressable'da),
//   o yüzden hiçbir şey çizmeyen dublörle değiştirilir.

import '@testing-library/react-native/extend-expect';

// Seçilen tarih/saati bileşene geri veren dublör. mode = 'date' | 'time'.
jest.mock('@react-native-community/datetimepicker', () => {
  const register = (props: any) => {
    const g = globalThis as any;
    g.__pickers = g.__pickers || {};
    g.__pickers[props.mode] = props.onChange;
    return null;
  };
  return { __esModule: true, default: register };
});

// Haptics tamamen yan etki; testte anlamı yok, sessizce yut.
jest.mock('@/lib/haptics', () => ({
  tapLight: jest.fn(),
  tapMedium: jest.fn(),
  notifySuccess: jest.fn(),
}));

// Vektör ikonlar: hiçbir şey çizmeyen dublör (bkz. dosya başı).
jest.mock('@expo/vector-icons', () => {
  const Icon = () => null;
  return { Feather: Icon, Ionicons: Icon };
});

// Cihaz dilini sabitle (tr) — i18n varsayılanı deterministik olsun.
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'tr' }],
}));

afterEach(() => {
  const g = globalThis as any;
  g.__pickers = {};
});
