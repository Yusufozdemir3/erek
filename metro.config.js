// On WEB only, a few native packages without web support resolve to local
// stubs, so UI changes can be previewed in a browser without a native build.
// Android/iOS are untouched.
//   expo-sqlite                    → no web build; crashes on import
//   react-native-google-mobile-ads → breaks Metro's bundling on web itself

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// moduleName -> path to the local stub to use on web.
const WEB_STUBS = {
  'expo-sqlite': 'src/web/expoSqliteWebStub.ts',
  'react-native-google-mobile-ads': 'src/web/googleMobileAdsWebStub.ts',
};

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const stub = platform === 'web' ? WEB_STUBS[moduleName] : undefined;
  if (stub) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, stub) };
  }
  if (upstreamResolveRequest) return upstreamResolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
