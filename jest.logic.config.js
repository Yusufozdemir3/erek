// Pure logic + repository + sync tests run in a Node environment (fast, no native).
// Native modules are swapped for test doubles (moduleNameMapper):
//   - expo-sqlite  -> a node:sqlite-based in-memory fake (real SQL behavior)
//   - expo-crypto  -> node:crypto randomUUID
//   - async-storage -> the package's official jest mock
//   - google-signin -> a local stub (the package ships ESM, which the Node project can't parse)
// Component (UI) tests run in a SEPARATE project (jest.ui.config.js) with jest-expo;
// this project ignores them (*.ui.test.tsx).
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
