// Logic, repository and sync tests in Node (fast, no native modules), with
// doubles: expo-sqlite → a node:sqlite in-memory fake (real SQL), expo-crypto →
// randomUUID, AsyncStorage → its official mock, google-signin → a local stub
// (it ships ESM). *.ui.test.tsx runs in jest.ui.config.js instead.
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
        // The project's tsconfig targets Metro (bundler/esnext); Jest needs CJS.
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
