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
        // Transpile only: `npm run typecheck` does the type checking, and
        // RN 0.88's types (package "exports") don't resolve under CJS settings.
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          isolatedModules: true,
          rootDir: __dirname,
          // TS 6 deprecates node10 resolution; fine for transpile-only CJS.
          ignoreDeprecations: '6.0',
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
