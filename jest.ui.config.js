// Component tests (*.ui.test.tsx) with jest-expo, rendering the real tree.
// Native doubles: src/test/setup-ui.tsx; expo-sqlite/crypto use the same Node
// fakes as the logic project, so repos work end to end.
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
    // Native-only module (TurboModule): same stub as the logic project. Needed
    // once a component's import chain reaches src/sync (e.g. friends/sharing).
    '^@react-native-google-signin/google-signin$': '<rootDir>/src/test/mocks/google-signin.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
