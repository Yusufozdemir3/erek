// Yerel release imzası: prebuild android/'ı her seferinde yeniden ürettiği için
// eklenti yükleme anahtarı bloğunu ekler; debug derleme türüne dokunmaz.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applySigning } = require('../../plugins/withReleaseSigning');

const TEMPLATE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}`;

describe('withReleaseSigning', () => {
  it('release imza bloğu eklenir, release yükleme anahtarına bağlanır, debug aynı kalır', () => {
    const out: string = applySigning(TEMPLATE);
    expect(out).toContain('storeFile file(EREK_UPLOAD_STORE_FILE)');
    expect(out).toMatch(/debug \{\s+signingConfig signingConfigs\.debug\s+\}/);
    expect(out).toContain(
      "signingConfig(project.hasProperty('EREK_UPLOAD_STORE_FILE') && !project.hasProperty('erekDebugSign') ? signingConfigs.release : signingConfigs.debug)"
    );
    expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
  });

  it('anahtar yoksa (ve -PerekDebugSign istenmediyse) Gradle uyarı yazar', () => {
    const out: string = applySigning(TEMPLATE);
    expect(out).toMatch(/else if \(!project\.hasProperty\('erekDebugSign'\)\) \{\s+\/\/.*\n\s+logger\.warn\('erek: EREK_UPLOAD_\* not set/);
  });

  it('tekrar çalıştırmak bir şey değiştirmez', () => {
    const once: string = applySigning(TEMPLATE);
    expect(applySigning(once)).toBe(once);
  });

  it('şablon değişmişse sessizce geçmez, hata verir', () => {
    expect(() => applySigning('android {}')).toThrow(/expected template/);
  });
});
