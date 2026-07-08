// Expo varsayılan Babel yapılandırması.
// react-native-reanimated'ın Babel eklentisi SDK 52'de babel-preset-expo içine
// gömülüdür — ayrıca eklenmez (çift eklenirse reanimated uyarı verir).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
