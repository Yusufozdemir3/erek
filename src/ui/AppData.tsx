// Uygulama genelinde paylaşılan veri context'i.
// Tek işi: açılışta initDataLayer()'ı BİR KEZ çalıştırmak ve aktif kullanıcıyı
// (anonim ya da hesaplı) tüm ekranlara sunmak. Ekranlar user.id'yi buradan alır,
// sonra doğrudan repository fonksiyonlarını çağırır - context içine SQL sızmaz.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo, initDataLayer, taskRepo, userRepo } from '@/db';
import type { User } from '@/db';
import { todayDate } from '@/lib/helpers';
import {
  migrateToMultiReminderIfNeeded,
  rescheduleAllGoalReminders,
  rescheduleAllReminders,
  rescheduleAllTaskReminders,
} from '@/lib/notifications';
import { runSync } from '@/sync';
import { ACCOUNTS_ENABLED } from '@/config';
import { useTheme } from '@/ui/ThemeProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { refreshWidget } from '@/widget/widgetData';

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
  // "Bugün" ekranında tamamlanan görev/alışkanlıkları gizle tercihi — Profil'de
  // ayarlanır (AsyncStorage'da kalıcı), ekran-özel bir filtre değil kalıcı bir tercih.
  hideCompleted: boolean;
  setHideCompleted: (v: boolean) => void;
}

const HIDE_COMPLETED_KEY = 'today:hideCompleted';

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
  const [hideCompleted, setHideCompletedState] = useState(false);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  const setHideCompleted = useCallback((v: boolean) => {
    setHideCompletedState(v);
    AsyncStorage.setItem(HIDE_COMPLETED_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_COMPLETED_KEY).then((v) => {
      if (v === '1') setHideCompletedState(true);
    });
  }, []);

  useEffect(() => {
    // Şemayı kurar, anonim kullanıcıyı garantiler. Yalnızca ilk açılışta çalışır.
    initDataLayer()
      .then(({ user }) => {
        setUser(user);
        // Açılışta mevcut hatırlatmaları DB'yi baz alarak yeniden programla
        // (cihaz reboot'u / uygulama güncellemesi onları temizlemiş olabilir).
        // Eski tekil-hatırlatma şemasından çoklu hatırlatmaya geçişte, ilk
        // açılışta bir kerelik OS bildirim kuyruğu nuke edilir (bkz. dosya başı
        // yorumu) — hemen ardından aşağıdaki reschedule* güncel DB durumundan
        // yeni şemayla baştan kurar. İzin yoksa sessizce çıkar.
        migrateToMultiReminderIfNeeded()
          .catch(() => {})
          .finally(() => {
            rescheduleAllReminders(habitRepo.listByUser(user.id)).catch((e) =>
              console.warn('[Bildirim] Açılışta hatırlatmalar programlanamadı:', e)
            );
            rescheduleAllTaskReminders(taskRepo.listByUser(user.id)).catch((e) =>
              console.warn('[Bildirim] Açılışta görev hatırlatmaları programlanamadı:', e)
            );
            rescheduleAllGoalReminders(goalRepo.listByUser(user.id)).catch((e) =>
              console.warn('[Bildirim] Açılışta hedef hatırlatmaları programlanamadı:', e)
            );
          });
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

  // Ana ekran widget'ını kullanıcı hazır olunca ve her veri değişiminde tazele.
  // dataVersion, notifyDataChanged ile artar (＋ menüsüyle ekleme, zamanlayıcı
  // commit'i, hedef güncellemesi…) → bu efekt hepsini kapsar. Bugün ekranındaki
  // alışkanlık işaretlemeleri lokal reload kullandığından oraya ayrıca çağrı var.
  // Android dışında ve Expo Go'da refreshWidget sessizce no-op'tur.
  useEffect(() => {
    if (user) refreshWidget(user.id);
  }, [user, dataVersion]);

  // Uygulama öne gelince de tazele: arka planda geçen süre, gün dönümü ve
  // (Profil'den yapılan) tema/dil değişimi bir sonraki açılışta widget'a yansısın.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && user) refreshWidget(user.id);
    });
    return () => sub.remove();
  }, [user]);

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
      value={{
        user,
        refreshUser,
        dataVersion,
        notifyDataChanged,
        selectedDate,
        setSelectedDate,
        hideCompleted,
        setHideCompleted,
      }}
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
