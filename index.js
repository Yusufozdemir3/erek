// Uygulama giriş noktası. expo-router kök bileşenini yükler ve (yalnızca gerçek
// build'de) Android ana ekran widget'ının arka plan görev işleyicisini kaydeder.
//
// react-native-android-widget yalnızca native modül varken (development/production
// build) yüklenmeli. Expo Go'da native modül yoktur ve paketin barrel import'u
// orada hata verebilir; bu yüzden require + try/catch ile korunur. İçe aktarılamazsa
// uygulama Expo Go'da normal çalışmaya devam eder, sadece widget devre dışı kalır.

import 'expo-router/entry';

try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // Expo Go / native modül yok — widget devre dışı, uygulama normal açılır.
}
