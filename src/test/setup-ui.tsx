// UI (bileşen) testleri için ortak kurulum: react-test-renderer üzerinde çalışan
// bileşenlerin ihtiyaç duyduğu native modüllerin test dublörleri.
//
// - @/ui/DatePickerModal, @/ui/TimePickerModal: özel takvim/tekerlek seçiciler
//   (native @react-native-community/datetimepicker'ın yerini aldılar). Testte
//   hiçbir şey çizmeyen ama açıkken onConfirm geri çağrısını global.__pickers'a
//   kaydeden bir dublörle değiştirilirler. Test, tarih/saat seçimini
//   `global.__pickers.date(date)` / `.time(date)` çağırarak simüle eder.
// - @/lib/haptics: dokunsal geri bildirim (expo-haptics) — testte sessiz no-op.
// - expo-localization: cihaz dili sabitlenir (tr) ki i18n deterministik olsun.
// - @expo/vector-icons: glif fontunu expo-font ile yükler; jest ortamında native
//   modül olmadığı için patlar ("loadedNativeFonts.forEach is not a function").
//   İkonlar salt görsel (erişilebilirlik etiketleri onları saran Pressable'da),
//   o yüzden hiçbir şey çizmeyen dublörle değiştirilir.

import '@testing-library/react-native/extend-expect';

// Açıkken onConfirm'i mode'a göre global.__pickers'a kaydeden dublörler.
// jest.mock fabrikaları dış kapsamdaki değişkenlere erişemediğinden (hoisting
// kısıtı) her biri kendi register mantığını tekrarlar.
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
