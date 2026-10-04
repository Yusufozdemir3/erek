// app.config.js: R8 yalnızca EREK_R8=1 ile açılır; açıkken diğer eklenti ayarları korunur.
/* eslint-disable @typescript-eslint/no-var-requires */

const loadConfig = (): ((a: { config: any }) => any) & { withR8: (c: any) => any } => {
  jest.resetModules();
  return require('../../app.config.js');
};

const base = {
  name: 'Erek',
  plugins: ['expo-font', ['expo-build-properties', { android: { compileSdkVersion: 36, targetSdkVersion: 36 } }]],
};
const buildProps = (cfg: any) => cfg.plugins.find((p: any) => Array.isArray(p) && p[0] === 'expo-build-properties')[1].android;

describe('app.config.js — R8', () => {
  const OLD = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD };
  });

  it('varsayılan: R8 anahtarları eklenmez', () => {
    delete process.env.EREK_R8;
    const cfg = loadConfig()({ config: base });
    expect(buildProps(cfg).enableProguardInReleaseBuilds).toBeUndefined();
    expect(buildProps(cfg).enableShrinkResourcesInReleaseBuilds).toBeUndefined();
  });

  it('EREK_R8=1: ikisi de açılır, SDK ayarları ve diğer eklentiler korunur', () => {
    process.env.EREK_R8 = '1';
    const cfg = loadConfig()({ config: base });
    expect(buildProps(cfg)).toMatchObject({
      compileSdkVersion: 36,
      targetSdkVersion: 36,
      enableProguardInReleaseBuilds: true,
      enableShrinkResourcesInReleaseBuilds: true,
    });
    expect(cfg.plugins[0]).toBe('expo-font');
  });

  it('başka bir değer (0, true) R8 açmaz', () => {
    process.env.EREK_R8 = 'true';
    expect(buildProps(loadConfig()({ config: base })).enableProguardInReleaseBuilds).toBeUndefined();
  });
});
