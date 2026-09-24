// Component (UI) tests: render the real React tree (react-test-renderer +
// @testing-library/react-native). The jest-expo preset transforms RN/expo
// modules with babel and sets up the right test environment. Only runs
// *.ui.test.tsx files; the fast Node logic tests live in a separate project
// (jest.logic.config.js).
//
// Native module doubles live in src/test/setup-ui.tsx (DateTimePicker, haptics,
// notifications, expo-localization). expo-sqlite/crypto are mapped to the same
// node-based fakes so component tests can verify real repo behavior end-to-end
// (e.g. subtask → task completion).
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
