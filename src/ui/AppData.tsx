// Uygulama genelinde paylaşılan veri context'i.
// Tek işi: açılışta initDataLayer()'ı BİR KEZ çalıştırmak ve aktif kullanıcıyı
// (anonim ya da hesaplı) tüm ekranlara sunmak. Ekranlar user.id'yi buradan alır,
// sonra doğrudan repository fonksiyonlarını çağırır - context içine SQL sızmaz.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDataLayer, userRepo } from '@/db';
import type { User } from '@/db';
import type { SyncResult } from '@/sync';
import { todayDate } from '@/lib/helpers';
import { migrateToMultiReminderIfNeeded, rescheduleEverything } from '@/lib/notifications';
import { maybeShowInterstitial } from '@/lib/ads';
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
  // — SENKRON DURUMU —
  // Son turun sonucu (otomatik ya da elle, fark etmez). Profil ekranı bunu
  // gösterir; BURADA tutulmasının sebebi otomatik turların ekran açık olmadan
  // da çalışması: eskiden açılış senkronunun sonucu hiçbir yere yazılmıyordu ve
  // kalıcı bir hata (RLS çakışması, süresi dolmuş oturum, eski bulut şeması)
  // kullanıcıya HİÇ görünmüyordu — yedeği olmadığını öğrenmesinin bir yolu yoktu.
  syncResult: SyncResult | null;
  // Son BAŞARILI senkronun zamanı (epoch ms). Uygulama yeniden başlasa da
  // korunur (AsyncStorage). null = bu cihazda hiç başarılı senkron olmadı.
  lastSyncAt: number | null;
  syncing: boolean;
  // Elle senkron (Profil'deki düğme, giriş sonrası ilk tur). Otomatik turlarla
  // AYNI durumu günceller. Sonucu döner çünkü kimi çağıran (LoginScreen) akışını
  // ona göre dallandırır — ama hepsi buradan geçmeli ki "son yedek" damgası ve
  // hata durumu tek yerde toplansın.
  syncNow: () => Promise<SyncResult>;
}

const HIDE_COMPLETED_KEY = 'today:hideCompleted';
const LAST_SYNC_KEY = 'sync:lastSuccessAt';

// Uygulama her ön plana geldiğinde senkron ETMEK istemiyoruz (uygulamalar arası
// gidip gelen kullanıcıda gereksiz trafik/batarya); ama saatlerce açık kalan bir
// oturumda da veriyi cihazda tutmak istemiyoruz. Aradaki denge: en fazla bu
// aralıkta bir kez.
const FOREGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

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
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  // Son senkron DENEMESİ (başarılı olsun olmasın) — ön plan tetikleyicisinin
  // aralık kapısı bunu kullanır. lastSyncAt'ten ayrı: hep hata veren bir kurulumda
  // lastSyncAt hiç ilerlemez ve kapı hiç kapanmazdı (her odaklanmada yeniden dener).
  const lastSyncAttemptRef = useRef(0);
  // Hatırlatmaların en son hangi GÜN yeniden kurulduğu ("YYYY-MM-DD").
  // Geçerlilikleri tarihe bağlı (alışkanlık başlangıç/bitiş, görev son tarihi,
  // hedef deadline'ı) ama OS tetikleyicileri tarih bilmez; bu yüzden gün
  // dönümünde bir kez yeniden kurulmaları gerekir. Süre değil GÜN kapısı:
  // düzeltilmesi gereken durumların hepsi takvim gününe bağlı.
  const lastRescheduleDayRef = useRef<string | null>(null);

  const notifyDataChanged = useCallback(() => setDataVersion((v) => v + 1), []);

  // Tek senkron giriş noktası: açılış, ön plana gelme ve Profil'deki düğme
  // hepsi buradan geçer — böylece durum tek yerde toplanır ve üç yol arasında
  // tutarsızlık olamaz.
  const syncUser = useCallback(async (userId: string): Promise<SyncResult> => {
    if (!ACCOUNTS_ENABLED) return { status: 'disabled' };
    lastSyncAttemptRef.current = Date.now();
    setSyncing(true);
    try {
      const r = await runSync(userId);
      // 'busy' hata değil (bkz. SyncResult): başka bir tur sürüyor demek.
      // Durumu EZMEMELİ — yoksa elle başlatılan turun sonucu ya da ekrandaki
      // gerçek hata, çakışan otomatik tur tarafından silinirdi.
      if (r.status === 'busy') return r;
      setSyncResult(r);
      if (r.status === 'ok') {
        const at = r.at ?? Date.now();
        setLastSyncAt(at);
        AsyncStorage.setItem(LAST_SYNC_KEY, String(at)).catch(() => {});
      }
      return r;
    } finally {
      setSyncing(false);
    }
  }, []);

  const setHideCompleted = useCallback((v: boolean) => {
    setHideCompletedState(v);
    AsyncStorage.setItem(HIDE_COMPLETED_KEY, v ? '1' : '0').catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(HIDE_COMPLETED_KEY).then((v) => {
      if (v === '1') setHideCompletedState(true);
    });
    // Son başarılı senkron damgası: "yedeğim ne kadar eski" sorusunun cevabı
    // uygulama yeniden başlatılınca da durmalı.
    AsyncStorage.getItem(LAST_SYNC_KEY).then((v) => {
      const n = v ? Number(v) : NaN;
      if (Number.isFinite(n)) setLastSyncAt(n);
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
            lastRescheduleDayRef.current = todayDate();
            rescheduleEverything(user.id);
          });
        // Açılışta arka planda bir kez senkronla (yapılandırılmamışsa sessiz geçer).
        // KULLANICI GİRİŞ YAPMAMIŞSA BU ÇAĞRI HİÇBİR ŞEY GÖNDERMEZ: runSync ilk
        // iş olarak ensureSignedIn'e sorar, o da oturum yoksa null döner ve tur
        // 'disabled' ile biter (anonim oturum AÇILMAZ — bkz. sync/auth.ts).
        // Yani veri ancak kullanıcı bilerek bir hesaba girdiyse cihazdan çıkar.
        // Sonuç syncResult'a yazılır (Profil gösterir) — eskiden buradaki .catch
        // ÖLÜ KODDU: runSync hiç throw etmez, hatayı döndürür; dolayısıyla kalıcı
        // bir senkron arızası hiçbir yere ulaşmıyordu.
        syncUser(user.id);
        // Soğuk açılış — tam ekran reklamın İKİ tetikleyicisinden biri (diğeri
        // aşağıdaki AppState 'active' — bkz. lib/ads.ts dosya başı yorumu).
        // Sıklık sınırını kendi başına uygular, burada ayrıca kapı gerekmez.
        maybeShowInterstitial();
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
  //
  // AYRICA SENKRON: eskiden senkronun TEK otomatik tetikleyicisi bu provider'ın
  // mount'uydu, yani SOĞUK açılış. Android süreci günlerce canlı tuttuğu için
  // uygulamayı her gün açan bir kullanıcıda `runSync` günlerce hiç çalışmayabilir;
  // o süre boyunca işaretlenen her şey yalnızca cihazda kalır (telefon kaybolursa
  // gider) ve ikinci cihaz asla güncellenmez — "bulut yedekleme" sözünün pratikte
  // karşılığı olmazdı. Aralık kapısı için bkz. FOREGROUND_SYNC_MIN_GAP_MS.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !user) return;
      refreshWidget(user.id);
      if (Date.now() - lastSyncAttemptRef.current >= FOREGROUND_SYNC_MIN_GAP_MS) {
        syncUser(user.id);
      }
      // Öne gelme — tam ekran reklamın ikinci tetikleyicisi (bkz. yukarıdaki
      // soğuk açılış çağrısı). BİLEREK burada değil: bir alışkanlık/görev
      // TAMAMLANDIĞINDA değil — bkz. lib/ads.ts dosya başı yorumu.
      maybeShowInterstitial();
      // Gün değiştiyse hatırlatmaları güncel tarihe göre baştan kur: dün biten
      // alışkanlığın tetikleyicisi susmalı, bugün başlayanınki kurulmalı. Süreç
      // günlerce canlı kalabildiği için bunu yalnız açılışta yapmak yetmiyordu
      // (bkz. rescheduleEverything başlığı).
      const today = todayDate();
      if (lastRescheduleDayRef.current !== today) {
        lastRescheduleDayRef.current = today;
        rescheduleEverything(user.id);
      }
    });
    return () => sub.remove();
  }, [user, syncUser]);

  // Context değeri memoize: her render'da yeni bir nesne üretmek, değişmeyen
  // alanlar için bile TÜM tüketicileri (her ekran, her liste hook'u) yeniden
  // çizmeye zorluyordu. Hook'ların çoğu (useCallback'li) zaten kararlı; asıl
  // değişenler senkron durumu ve seçili gün.
  const value = useMemo<AppData | null>(
    () =>
      user
        ? {
            user,
            refreshUser,
            dataVersion,
            notifyDataChanged,
            selectedDate,
            setSelectedDate,
            hideCompleted,
            setHideCompleted,
            syncResult,
            lastSyncAt,
            syncing,
            syncNow: () => syncUser(user.id),
          }
        : null,
    [
      user,
      refreshUser,
      dataVersion,
      notifyDataChanged,
      selectedDate,
      hideCompleted,
      setHideCompleted,
      syncResult,
      lastSyncAt,
      syncing,
      syncUser,
    ]
  );

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>{t('app.dataLayerError')}</Text>
        <Text style={[styles.errorBody, { color: colors.muted }]}>{error}</Text>
      </View>
    );
  }

  // user null iken value da null (yukarıdaki useMemo) — ikisi birlikte hareket
  // eder, dolayısıyla buradan sonra sağlayıcıya asla null geçmez.
  if (!user || !value) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
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
