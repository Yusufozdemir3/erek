// Metro config — ONE customization: on the WEB platform, redirects a few
// native packages that have no real web support to local stubs. Android/iOS
// are NOT AFFECTED — this redirection only kicks in when platform==='web';
// the real native modules keep being used untouched everywhere else.
//
// WHY a web preview: the app is only published on Android. This file exists
// solely so UI/style changes can be checked in the Browser pane without
// waiting through a ~9-minute native Gradle build — NOT to make the app
// functionally work on web.
//
// WHY THE LIST CAN GROW: each package is here for its own reason —
//   expo-sqlite                   → has no web/wasm build at all, it crashed
//                                    immediately on import ("Cannot find native module").
//   react-native-google-mobile-ads → has NO web support in the package; its
//                                    internal module graph stops Metro during
//                                    the BUNDLING stage itself (can't find a
//                                    file) — a class of error try/catch can't
//                                    catch, the only fix is to never resolve
//                                    the module from this package at all.
// If a new native dependency breaks the same way on web, add one more line
// here; native/iOS behavior is still NEVER affected.
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
