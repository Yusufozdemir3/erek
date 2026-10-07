// Expo's Babel preset. It already includes reanimated's plugin (adding it again warns).

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
