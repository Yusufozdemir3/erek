// Windows'ta yeni CMake: local.properties'e tek bir cmake.dir satırı yazılır,
// diğer satırlar korunur, ters bölüler Gradle için düz bölüye çevrilir.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withCmakeDirLine } = require('../../plugins/withWindowsCmake');

describe('withWindowsCmake', () => {
  it('boş dosyaya cmake.dir eklenir', () => {
    expect(withCmakeDirLine('', 'C:\\Sdk\\cmake\\3.31.6')).toBe('cmake.dir=C:/Sdk/cmake/3.31.6\n');
  });

  it('eski cmake.dir değişir, diğer satırlar kalır', () => {
    const out = withCmakeDirLine('sdk.dir=C:/Sdk\r\ncmake.dir=C:/old\r\n', 'C:/Sdk/cmake/3.31.6');
    expect(out).toBe('sdk.dir=C:/Sdk\ncmake.dir=C:/Sdk/cmake/3.31.6\n');
  });
});
