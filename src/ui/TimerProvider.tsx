// Zamanlayıcı alışkanlıkların CANLI sayaç motoru (Aşama B).
// Aynı anda tek bir zamanlayıcı çalışır. Çalışan durum AsyncStorage'da tutulur;
// böylece uygulama kapansa/arka plana atılsa da süre gerçek duvar-saatiyle işler
// (startedAt damgasından hesaplanır). Duraklat/bitir'de biriken saniye
// habit_logs.amount'a yazılır (habitRepo.incrementAmount). Hedefe ulaşınca
// completed=1 olur AMA zamanlayıcı DURMAZ — kullanıcı isterse hedefi aşarak
// çalışmaya devam edebilir (celebratedRef, oturum başına tek seferlik
// commit+haptik+bildirim-iptali sağlar). Bildirim hedef anına kurulur.
//
// Tek doğru kaynak yine SQLite: bu modül yalnızca "şu an ne kadar süre geçti"nin
// geçici (çalışan) durumunu ve tik'i yönetir; kalıcı toplam DB'dedir.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { habitRepo } from '@/db';
import { todayDate } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
// Saf zaman matematiği ayrı modülde (test edilebilir); gece yarısı kararı da orada.
import { commitDelta, elapsedOf, isFinished, type ActiveTimer } from '@/lib/timerLogic';
import { useAppData } from '@/ui/AppData';

const ACTIVE_KEY = 'timer:active';

interface TimerApi {
  isRunning: (habitId: string) => boolean;
  // Aktif alışkanlık için canlı saniye (base + geçen, hedefi aşabilir); değilse null.
  liveSeconds: (habitId: string) => number | null;
  start: (habitId: string) => void;
  pause: () => void;
  reset: (habitId: string) => void;
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
  const [, setNow] = useState(Date.now()); // her saniye yeniden render tetikler
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

  // Aktif süreyi kalıcılaştır: geçen saniyeyi DB'ye ekle, bildirimi iptal et.
  const commit = useCallback((a: ActiveTimer) => {
    const delta = commitDelta(a);
    if (delta > 0) habitRepo.incrementAmount(a.habitId, a.date, delta, a.targetSeconds);
    cancelTimerDone(a.habitId);
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

  // Açılışta kalıcı durumu geri yükle. Kapalıyken hedef dolduysa ilerlemeyi
  // hemen DB'ye yaz (tamamlandı sayılsın, bağlı hedefe +1 işlensin) ama
  // zamanlayıcıyı DURDURMA — kullanıcı isterse çalışmaya devam etsin.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as ActiveTimer;
        if (isFinished(a)) {
          commit(a);
          celebratedRef.current = true;
          notifyDataChanged();
          const updated: ActiveTimer = { ...a, baseSeconds: elapsedOf(a), startedAt: Date.now() };
          setActive(updated);
          persist(updated);
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
    (habitId: string) => {
      const habit = habitRepo.getById(habitId);
      if (!habit || habit.kind !== 'timer' || !habit.target_amount) return;
      const target = habit.target_amount;
      const date = todayDate();
      const base = habitRepo.getAmountOn(habitId, date);
      // Not: hedefe zaten ulaşılmış olsa bile başlatılabilir — kullanıcı hedefi
      // aştıktan sonra da devam edebilir (bkz. celebratedRef).
      // Tek aktif zamanlayıcı: başkası çalışıyorsa önce onu kaydet.
      if (activeRef.current && activeRef.current.habitId !== habitId) {
        commit(activeRef.current);
        notifyDataChanged();
      }
      celebratedRef.current = base >= target; // zaten tamamlanmışsa yeniden kutlama.
      const a: ActiveTimer = {
        habitId,
        date,
        startedAt: Date.now(),
        baseSeconds: base,
        targetSeconds: target,
      };
      setActive(a);
      persist(a);
      if (base < target) scheduleTimerDone(habit, target - base);
    },
    [commit, notifyDataChanged]
  );

  const pause = useCallback(() => stopActive(), [stopActive]);

  const reset = useCallback(
    (habitId: string) => {
      const date = todayDate();
      // Çalışıyorsa kaydetmeden durdur (sıfırlayacağız).
      if (activeRef.current?.habitId === habitId) {
        cancelTimerDone(habitId);
        setActive(null);
        persist(null);
      }
      const current = habitRepo.getAmountOn(habitId, date);
      if (current > 0) {
        const habit = habitRepo.getById(habitId);
        habitRepo.incrementAmount(habitId, date, -current, habit?.target_amount ?? null);
      }
      notifyDataChanged();
    },
    [notifyDataChanged]
  );

  const isRunning = (habitId: string) => active?.habitId === habitId;
  const liveSeconds = (habitId: string) =>
    active?.habitId === habitId ? elapsedOf(active) : null;

  return (
    <TimerContext.Provider value={{ isRunning, liveSeconds, start, pause, reset }}>
      {children}
    </TimerContext.Provider>
  );
}
