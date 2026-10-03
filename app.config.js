// Dynamic layer over app.json (Expo reads app.json first and passes it in as
// `config`). Only one thing here is dynamic: Firebase's google-services.json,
// which push notifications (friend nudges) need on Android. It is NOT
// committed (see .gitignore): a local build picks it up from the project
// root, an EAS build from the GOOGLE_SERVICES_JSON file variable. Without it
// the app builds and runs as before — only friend nudges fall back to the
// share sheet. Setup: docs/push-setup.md.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(local) ? './google-services.json' : undefined);
  if (!googleServicesFile) return config;
  return { ...config, android: { ...config.android, googleServicesFile } };
};
