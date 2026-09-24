// Default Expo Babel configuration.
// react-native-reanimated's Babel plugin is bundled into babel-preset-expo as
// of SDK 52 — it's not added separately (adding it twice makes reanimated warn).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
