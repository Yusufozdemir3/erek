// Saf mantık + repository + sync testleri Node ortamında koşar (hızlı, native yok).
// Native modüller test dublörleriyle değiştirilir (moduleNameMapper):
//   - expo-sqlite  -> node:sqlite tabanlı in-memory sahte (gerçek SQL davranışı)
//   - expo-crypto  -> node:crypto randomUUID
//   - async-storage -> paketin resmi jest mock'u
//   - google-signin -> yerel dublör (paket ESM yayınlıyor, Node projesi ayrıştıramaz)
// Bileşen (UI) testleri AYRI projede (jest.ui.config.js) jest-expo ile koşar;
// bu proje onları görmezden gelir (*.ui.test.tsx).
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'logic',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testPathIgnorePatterns: ['/node_modules/', '\\.ui\\.test\\.tsx$'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Proje tsconfig'i Metro'ya göre (bundler/esnext); Jest CJS ister.
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/src/test/mocks/expo-crypto.ts',
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^@react-native-google-signin/google-signin$': '<rootDir>/src/test/mocks/google-signin.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
