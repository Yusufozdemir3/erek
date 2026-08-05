// Metro config — TEK özelleştirme: WEB platformunda, gerçek web desteği olmayan
// bazı native paketleri yerel dublörlere yönlendirir. Android/iOS ETKİLENMEZ —
// bu yönlendirme yalnızca platform==='web' iken devreye girer, gerçek native
// modüller orada dokunulmadan kullanılmaya devam eder.
//
// NEDEN web önizlemesi: uygulama yalnızca Android'de yayınlanıyor. Bu dosya
// yalnızca UI/stil değişikliklerini ~9 dakikalık native Gradle build beklemeden
// Browser pane'de görebilmek için var — uygulamayı web'de işlevsel çalıştırmak için DEĞİL.
//
// LİSTE NEDEN BÜYÜYEBİLİR: her paket kendi nedeniyle burada —
//   expo-sqlite                   → web/wasm derlemesi hiç yok, import anında
//                                    çöküyordu ("Cannot find native module").
//   react-native-google-mobile-ads → pakette web desteği YOK; iç modül grafiği
//                                    Metro'yu daha BUNDLING aşamasında durduruyor
//                                    (bir dosyayı bulamıyor) — bu try/catch ile
//                                    yakalanamayan bir hata sınıfı, tek çözüm
//                                    modülü hiç bu paketten çözmemek.
// Yeni bir native bağımlılık web'de aynı şekilde patlarsa buraya bir satır daha
// eklenir; native/iOS davranışı yine ASLA etkilenmez.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// moduleName -> web'de kullanılacak yerel dublörün yolu.
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
