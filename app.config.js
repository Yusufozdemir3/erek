// The dynamic part over app.json:
// 1. google-services.json (push for friend nudges) — not committed; a local
//    build takes it from the project root, EAS from the GOOGLE_SERVICES_JSON
//    file variable. Without it only friend nudges fall back to the share sheet
//    (docs/push-setup.md).
// 2. R8 shrinking, only with EREK_R8=1: minifying can break reflection-based
//    native modules in ways only a device shows, so it stays a test build
//    until every screen is checked (docs/r8-test.md).

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
