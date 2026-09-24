// Replaces expo-crypto in tests (jest.config.js moduleNameMapper).
// Produces a real UUID for newId() without needing a native module.

import * as nodeCrypto from 'node:crypto';

export function randomUUID(): string {
  return nodeCrypto.randomUUID();
}
