// Windows only: points Gradle at a newer CMake from the Android SDK. AGP's
// default CMake 3.22.1 bundles ninja 1.10, which can't create paths over 260
// characters, and RN 0.88's codegen object paths (reanimated, worklets) go
// past that even with LongPathsEnabled. ninja 1.12 (in CMake 3.31) handles them.
// Writes cmake.dir to android/local.properties (android/ is generated, hence a
// plugin); skipped when that CMake isn't installed, e.g. on EAS (Linux).

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const CMAKE_VERSION = '3.31.6';

function sdkRoot(env = process.env) {
  return (
    env.ANDROID_HOME ||
    env.ANDROID_SDK_ROOT ||
    (env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android', 'Sdk') : undefined)
  );
}

// Returns local.properties with cmake.dir set (any earlier cmake.dir replaced).
function withCmakeDirLine(contents, cmakeDir) {
  const line = `cmake.dir=${cmakeDir.replace(/\\/g, '/')}`;
  const kept = contents.split(/\r?\n/).filter((l) => l && !l.startsWith('cmake.dir='));
  return [...kept, line].join('\n') + '\n';
}

module.exports = function withWindowsCmake(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const root = sdkRoot();
      if (process.platform !== 'win32' || !root) return cfg;
      const cmakeDir = path.join(root, 'cmake', CMAKE_VERSION);
      if (!fs.existsSync(path.join(cmakeDir, 'bin', 'cmake.exe'))) return cfg;
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      fs.writeFileSync(file, withCmakeDirLine(before, cmakeDir));
      return cfg;
    },
  ]);
};
module.exports.withCmakeDirLine = withCmakeDirLine;
