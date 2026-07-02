// Testlerde expo-crypto yerine geçer (jest.config.js moduleNameMapper).
// newId() için native modül gerektirmeden gerçek UUID üretir.

import * as nodeCrypto from 'node:crypto';

export function randomUUID(): string {
  return nodeCrypto.randomUUID();
}
