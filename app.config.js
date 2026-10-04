// Dynamic layer over app.json (Expo reads app.json first and passes it in as
// `config`). Two things here are dynamic:
//
// 1. Firebase's google-services.json, which push notifications (friend
//    nudges) need on Android. It is NOT committed (see .gitignore): a local
//    build picks it up from the project root, an EAS build from the
//    GOOGLE_SERVICES_JSON file variable. Without it the app builds and runs
//    as before — only friend nudges fall back to the share sheet. Setup:
//    docs/push-setup.md.
//
// 2. R8 code + resource shrinking, OFF unless EREK_R8=1 is set for the build.
//    It stays opt-in on purpose: minifying can break reflection-based native
//    modules (notifications, sqlite, widgets) in ways only a real device shows,
//    so an R8 build is a TEST build until every screen has been walked through
//    on it. Turning it on for good = drop the condition. See docs/r8-test.md.
const fs = require('fs');
const path = require('path');

// Adds the two R8 switches to the expo-build-properties plugin entry.
function withR8(config) {
  const plugins = (config.plugins ?? []).map((p) => {
    if (!Array.isArray(p) || p[0] !== 'expo-build-properties') return p;
    const props = p[1] ?? {};
    return [
      p[0],
      {
        ...props,
        android: {
          ...props.android,
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ];
  });
  return { ...config, plugins };
}

module.exports = ({ config }) => {
  let out = config;
  if (process.env.EREK_R8 === '1') out = withR8(out);

  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  if (!googleServicesFile) return out;
  return { ...out, android: { ...out.android, googleServicesFile } };
};
module.exports.withR8 = withR8;
