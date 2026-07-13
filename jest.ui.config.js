// Bileşen (UI) testleri: gerçek React ağacını render eder (react-test-renderer +
// @testing-library/react-native). jest-expo preset'i RN/expo modüllerini babel ile
// dönüştürür ve doğru test ortamını kurar. Yalnızca *.ui.test.tsx dosyalarını koşar;
// hızlı Node mantık testleri ayrı projededir (jest.logic.config.js).
//
// Native modül dublörleri src/test/setup-ui.tsx içinde (DateTimePicker, haptics,
// bildirimler, expo-localization). expo-sqlite/crypto yine node tabanlı sahtelerle
// eşlenir ki bileşen testleri gerçek repo davranışını (ör. alt görev → görev
// tamamlanması) uçtan uca doğrulayabilsin.
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'ui',
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.ui.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup-ui.tsx'],
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/src/test/mocks/expo-crypto.ts',
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
