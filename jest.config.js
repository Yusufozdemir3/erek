// Test altyapısı: saf mantık + repository + sync testleri Node ortamında koşar.
// Native modüller test dublörleriyle değiştirilir (moduleNameMapper):
//   - expo-sqlite  -> node:sqlite tabanlı in-memory sahte (gerçek SQL davranışı)
//   - expo-crypto  -> node:crypto randomUUID
//   - async-storage -> paketin resmi jest mock'u
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
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
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
