// Giriş rotası (modal) — açılış kapısını "Şimdilik geç" ile atlayan kullanıcı
// sonradan Profil'den buraya gelir. Ekranın kendisi src/ui/LoginScreen.tsx'te:
// aynı bileşen hem burada hem açılış kapısında (LoginGate) kullanılır, tek kaynak.
// Buradan açılınca "geç" düğmesi YOK — kullanıcı zaten bilerek geldi, vazgeçmek
// için modalı kapatması yeterli.

import { router } from 'expo-router';
import { LoginScreen } from '@/ui/LoginScreen';

export default function LoginRoute() {
  return <LoginScreen onDone={() => router.back()} />;
}
