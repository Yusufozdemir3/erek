// Ortadaki ＋ sekmesinin rota dosyası. Gerçek bir ekran DEĞİL: _layout.tsx
// tabBarButton'ı tamamen değiştirdiği için buraya normalde hiç gelinmez
// (buton navigasyon yerine AddSheet açar). Derin bağlantı gibi bir yolla
// yine de gelinirse Bugün'e yönlendirir.

import { Redirect } from 'expo-router';

export default function AddScreen() {
  return <Redirect href="/" />;
}
