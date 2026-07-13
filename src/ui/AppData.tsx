// Uygulama genelinde paylaşılan veri context'i.
// Tek işi: açılışta initDataLayer()'ı BİR KEZ çalıştırmak ve aktif kullanıcıyı
// (anonim ya da hesaplı) tüm ekranlara sunmak. Ekranlar user.id'yi buradan alır,
// sonra doğrudan repository fonksiyonlarını çağırır - context içine SQL sızmaz.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { habitRepo, initDataLayer, taskRepo, userRepo } from '@/db';
import type { User } from '@/db';
import { todayDate } from '@/lib/helpers';
import { rescheduleAllReminders, rescheduleAllTaskReminders } from '@/lib/notifications';
import { runSync } from '@/sync';
import { ACCOUNTS_ENABLED } from '@/config';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';

interface AppData {
  user: User;
  // Yerel kullanıcıyı DB'den yeniden okur (ör. hesap bağlandıktan sonra e-posta
  // güncellensin diye). Ekranlardaki user referansını tazeler.
  refreshUser: () => void;
  // Ekran-dışı bir yerden (ör. merkezi ＋ menüsü) veri eklendiğinde artar.
  // Liste hook'ları bunu reload bağımlılığına koyar; böylece odak değişmese de
  // (üstte modal kapanınca focus olayı gelmez) görünür liste tazelenir.
  dataVersion: number;
  notifyDataChanged: () => void;
  // "Bugün" ekranında o an bakılan gün ("YYYY-MM-DD"). Merkezi ＋ menüsü (AddSheet)
  // sekme çubuğunda yaşadığı için hangi günün görüntülendiğini bilmez; burada
  // paylaşılınca yeni görev bakılan güne varsayılan tarihle eklenir.
  selectedDate: string;
  setSelectedDate: (d: string) => void;
}

const AppDataContext = createContext<AppData | null>(null);

// Ekranlar kullanıcıya bu hook ile erişir. Provider dışında çağrılırsa erken hata verir.
export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) {
    throw new Error('useAppData yalnızca <AppDataProvider> içinde kullanılabilir.');
  }
  return value;
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayDate());

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  useEffect(() => {
    // Şemayı kurar, anonim kullanıcıyı garantiler. Yalnızca ilk açılışta çalışır.
    initDataLayer()
      .then(({ user }) => {
        setUser(user);
        // Açılışta mevcut hatırlatmaları DB'yi baz alarak yeniden programla
        // (cihaz reboot'u / uygulama güncellemesi onları temizlemiş olabilir).
        // İzin yoksa sessizce çıkar; hata uygulamayı bloklamasın.
        rescheduleAllReminders(habitRepo.listByUser(user.id)).catch((e) =>
          console.warn('[Bildirim] Açılışta hatırlatmalar programlanamadı:', e)
        );
        rescheduleAllTaskReminders(taskRepo.listByUser(user.id)).catch((e) =>
          console.warn('[Bildirim] Açılışta görev hatırlatmaları programlanamadı:', e)
        );
        // Açılışta arka planda bir kez senkronla (yapılandırılmamışsa sessiz geçer).
        // Hesap özelliği kapalıyken (MVP) senkron hiç başlamaz — hiçbir veri
        // cihazdan çıkmaz (anonim oturum bile açılmaz). Bkz. src/config.ts.
        if (ACCOUNTS_ENABLED) {
          runSync(user.id).catch((e) => console.warn('[Senkron] Açılış senkronu başarısız:', e));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const refreshUser = useCallback(() => {
    setUser(userRepo.getOrCreateLocal());
  }, []);

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>{t('app.dataLayerError')}</Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AppDataContext.Provider
      value={{ user, refreshUser, dataVersion, notifyDataChanged, selectedDate, setSelectedDate }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

const styles = StyleSheet.create({
  // Renkler render'da temaya göre inline verilir (backgroundColor/color).
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 13,
    textAlign: 'center',
  },
});
