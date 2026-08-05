// Zamanlayıcı motoru — hem alışkanlık (kind='timer') hem süre-ölçümlü sayısal
// hedef (unit=TIME_UNIT, bkz. helpers.ts) için ORTAK (Aşama C: bağımsız sayaç).
// Aynı anda tek bir zamanlayıcı çalışır — türü/hedefi ne olursa olsun. Çalışan
// durum AsyncStorage'da tutulur; böylece uygulama kapansa/arka plana atılsa da
// süre gerçek duvar-saatiyle işler (startedAt damgasından hesaplanır).
// Duraklat/bitir'de biriken saniye ilgili yere yazılır: habit → habitRepo.
// incrementAmount (habit_logs.amount), goal → goalRepo.addProgress (current_value
// + goal_entries, tempo/projeksiyon otomatik faydalanır). Hedefe ulaşınca
// tamamlanmış SAYILIR (oran 1'e dayanır) AMA zamanlayıcı DURMAZ ve sayaç da
// kırpılmaz — kullanıcı hedefi aşarak çalışmaya devam edebilir, fazladan geçen
// süre de dürüstçe kaydedilir (celebratedRef, oturum başına tek seferlik
// commit+haptik+bildirim-iptali sağlar). Bildirim hedef anına kurulur.
//
// Tek doğru kaynak yine SQLite: bu modül yalnızca "şu an ne kadar süre geçti"nin
// geçici (çalışan) durumunu ve tik'i yönetir; kalıcı toplam DB'dedir.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import { isTimeUnit, todayDate } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
// Saf zaman matematiği ayrı modülde (test edilebilir); gece yarısı kararı da orada.
import {
  commitDelta,
  elapsedOf,
  isFinished,
  isStaleSession,
  restoreCommitDelta,
  type ActiveTimer,
  type TimerKind,
} from '@/lib/timerLogic';
import { useAppData } from '@/ui/AppData';

const ACTIVE_KEY = 'timer:active';

interface TimerApi {
  isRunning: (kind: TimerKind, id: string) => boolean;
  // Aktif hedef için canlı saniye (base + geçen, hedefi aşabilir); değilse null.
  liveSeconds: (kind: TimerKind, id: string) => number | null;
  // Şu an çalışan zamanlayıcının türü/id'si — mini durum şeridi için (bkz. TimerStrip).
  active: () => { kind: TimerKind; id: string } | null;
  start: (kind: TimerKind, id: string) => void;
  pause: () => void;
  // Yalnızca 'habit' için anlamlı (bugünkü birikimi sıfırlar); 'goal' hedefler
  // toplam/kalıcı ilerleme tuttuğundan (günlük değil) sıfırlama desteklenmez —
  // bilinçli kısıtlama, yanlışlıkla ay/yıllık ilerlemeyi silmeyi önler.
  reset: (kind: TimerKind, id: string) => void;
}

const TimerContext = createContext<TimerApi | null>(null);

export function useTimer(): TimerApi {
  const v = useContext(TimerContext);
  if (!v) throw new Error('useTimer yalnızca <TimerProvider> içinde kullanılabilir.');
  return v;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { notifyDataChanged } = useAppData();
  const [active, setActive] = useState<ActiveTimer | null>(null);
  // Her saniye yeniden render tetikler. Değeri ATILMIYOR: aşağıdaki context
  // değeri onunla memoize ediliyor (bkz. useMemo) — canlı sayaç `now`'a bağlı
  // olduğundan tik başına tazelenmeli, ama tik DIŞINDAKİ render'larda (ör. üstteki
  // AppData durumu değişince) tüketicileri boşuna yeniden çizmemeli.
  const [now, setNow] = useState(Date.now());
  // Interval/async içinde en güncel active'e erişmek için ref (kapanış bayatlamasın).
  const activeRef = useRef<ActiveTimer | null>(null);
  activeRef.current = active;
  // Bu oturumda hedefe ulaşma "kutlaması" (commit+haptik) zaten yapıldı mı —
  // her saniye tekrar tetiklenmesin diye. start()'ta her yeni oturumda sıfırlanır.
  const celebratedRef = useRef(false);

  const persist = (a: ActiveTimer | null) => {
    if (a) AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    else AsyncStorage.removeItem(ACTIVE_KEY);
  };

  // Aktif süreyi kalıcılaştır: geçen saniyeyi ilgili yere ekle, bildirimi iptal et.
  // `seconds` yalnız geri yükleme yolunda verilir (bkz. restoreCommitDelta) —
  // normal duraklat/bitir akışında koşan sürenin tamamı yazılır.
  const commit = useCallback((a: ActiveTimer, seconds?: number) => {
    const delta = seconds ?? commitDelta(a);
    if (delta > 0) {
      if (a.kind === 'habit') habitRepo.incrementAmount(a.targetId, a.date, delta, a.targetSeconds);
      // Eskiden ayrı bir addTimeProgress vardı (tek farkı hedef tavanını
      // uygulamamasıydı). addProgress'in tavanı kalktığı için ikisi aynı
      // fonksiyon oldu ve tekil yazma yolunda birleşti — bkz. goalRepo.addProgress.
      else goalRepo.addProgress(a.targetId, delta);
    }
    cancelTimerDone(a.targetId);
  }, []);

  const stopActive = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    // Kutlama tıkta zaten yapıldıysa (hedefe ulaşılıp çalışmaya devam edildiyse)
    // duraklatmada ikinci kez başarı titreşimi vermeyelim.
    const reachedTarget = isFinished(a) && !celebratedRef.current;
    commit(a);
    setActive(null);
    persist(null);
    if (reachedTarget) notifySuccess(); // hedefe ulaşınca başarı titreşimi
    notifyDataChanged();
  }, [commit, notifyDataChanged]);

  // Açılışta kalıcı durumu geri yükle.
  //
  // Bu efekt yalnız SÜREÇ yeniden başladığında çalışır (uygulama arka plandan öne
  // gelirken bileşen zaten mount'tur, buraya düşmez). Yani buradaki seans, hiç
  // kimsenin başında olmadığı bir aralığı temsil ediyor olabilir — duvar saati
  // olduğu gibi yazılamaz (bkz. timerLogic.isStaleSession/restoreCommitDelta).
  //
  // BAYAT seans (gün değişmiş ya da kapalıyken hedef dolmuş): hedefe kalan kadarı
  // yazılıp seans KAPATILIR. Eskiden burada geçen sürenin tamamı yazılıp
  // zamanlayıcı çalışmaya devam ediyordu; iki gün kapalı kalan bir uygulama
  // seansın başladığı güne 48 saat yazabiliyordu ve o kayıt geçmiş bir güne
  // düştüğü için "Sıfırla" ile bile geri alınamıyordu.
  //
  // TAZE seans (aynı gün, hedef henüz dolmamış): eskisi gibi olduğu yerden devam
  // eder — kısa bir çökme/yeniden başlatma seansı bozmamalı.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as ActiveTimer;
        if (isStaleSession(a, todayDate())) {
          commit(a, restoreCommitDelta(a));
          setActive(null);
          persist(null);
          notifyDataChanged();
        } else {
          setActive(a);
        }
      } catch {
        AsyncStorage.removeItem(ACTIVE_KEY);
      }
    })();
    // yalnız ilk mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aktifken her saniye: hedefe ilk ulaşıldığında ilerlemeyi DB'ye yaz + başarı
  // titreşimi ver, ama zamanlayıcıyı DURDURMA — sayaç tabanı güncellenip aynı
  // oturuma (hedefi aşarak) devam eder. Sonraki tiklerde yalnızca render tetiklenir.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const a = activeRef.current;
      if (!a) return;
      if (!celebratedRef.current && isFinished(a)) {
        celebratedRef.current = true;
        commit(a);
        notifySuccess();
        notifyDataChanged();
        const updated: ActiveTimer = { ...a, baseSeconds: elapsedOf(a), startedAt: Date.now() };
        activeRef.current = updated;
        setActive(updated);
        persist(updated);
      } else {
        setNow(Date.now());
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, commit, notifyDataChanged]);

  const start = useCallback(
    (kind: TimerKind, targetId: string) => {
      let base: number;
      let target: number;
      let title: string;
      if (kind === 'habit') {
        const habit = habitRepo.getById(targetId);
        if (!habit || habit.kind !== 'timer' || !habit.target_amount) return;
        target = habit.target_amount;
        base = habitRepo.getAmountOn(targetId, todayDate());
        title = habit.title;
      } else {
        const goal = goalRepo.getById(targetId);
        if (!goal || goal.goal_type !== 'numeric' || !isTimeUnit(goal.unit) || !goal.target_value) return;
        target = goal.target_value;
        base = goal.current_value;
        title = goal.title;
      }
      // Not: hedefe zaten ulaşılmış olsa bile başlatılabilir — kullanıcı hedefi
      // aştıktan sonra da devam edebilir (bkz. celebratedRef).
      // Tek aktif zamanlayıcı: başkası çalışıyorsa önce onu kaydet.
      if (
        activeRef.current &&
        (activeRef.current.kind !== kind || activeRef.current.targetId !== targetId)
      ) {
        commit(activeRef.current);
        notifyDataChanged();
      }
      celebratedRef.current = base >= target; // zaten tamamlanmışsa yeniden kutlama.
      const a: ActiveTimer = {
        kind,
        targetId,
        date: todayDate(),
        startedAt: Date.now(),
        baseSeconds: base,
        targetSeconds: target,
      };
      setActive(a);
      persist(a);
      if (base < target) scheduleTimerDone(targetId, title, target - base);
    },
    [commit, notifyDataChanged]
  );

  const pause = useCallback(() => stopActive(), [stopActive]);

  const reset = useCallback(
    (kind: TimerKind, targetId: string) => {
      if (kind !== 'habit') return; // bkz. TimerApi.reset yorumu — hedeflerde desteklenmez
      const date = todayDate();
      // Çalışıyorsa kaydetmeden durdur (sıfırlayacağız).
      if (activeRef.current?.kind === 'habit' && activeRef.current.targetId === targetId) {
        cancelTimerDone(targetId);
        setActive(null);
        persist(null);
      }
      const current = habitRepo.getAmountOn(targetId, date);
      if (current > 0) {
        const habit = habitRepo.getById(targetId);
        habitRepo.incrementAmount(targetId, date, -current, habit?.target_amount ?? null);
      }
      notifyDataChanged();
    },
    [notifyDataChanged]
  );

  // `now` bilerek bağımlılıkta: canlı sayaç duvar saatinden okunuyor, yani
  // tik başına yeni bir context değeri ŞART. Memoizasyonun kazancı tik DIŞINDAKİ
  // render'lar (üstteki sağlayıcıların durumu değişince TimerProvider da yeniden
  // render oluyordu ve her seferinde yeni nesne üretip tüm tüketicileri —
  // HabitTimer, TimerPicker, TimerStrip — boşuna yeniden çiziyordu).
  const api = useMemo<TimerApi>(() => {
    const isRunning = (kind: TimerKind, id: string) =>
      active?.kind === kind && active?.targetId === id;
    return {
      isRunning,
      liveSeconds: (kind, id) => (isRunning(kind, id) ? elapsedOf(active!, now) : null),
      active: () => (active ? { kind: active.kind, id: active.targetId } : null),
      start,
      pause,
      reset,
    };
  }, [active, now, start, pause, reset]);

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
}
