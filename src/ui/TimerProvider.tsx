// Zamanlayıcı alışkanlıkların CANLI sayaç motoru (Aşama B).
// Aynı anda tek bir zamanlayıcı çalışır. Çalışan durum AsyncStorage'da tutulur;
// böylece uygulama kapansa/arka plana atılsa da süre gerçek duvar-saatiyle işler
// (startedAt damgasından hesaplanır). Duraklat/bitir/sıfırla ya da hedefe ulaşınca
// biriken saniye habit_logs.amount'a yazılır (habitRepo.incrementAmount) ve
// hedefe ulaşınca completed=1 olur. Bildirim hedef anına kurulur.
//
// Tek doğru kaynak yine SQLite: bu modül yalnızca "şu an ne kadar süre geçti"nin
// geçici (çalışan) durumunu ve tik'i yönetir; kalıcı toplam DB'dedir.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { habitRepo } from '@/db';
import { todayDate } from '@/lib/helpers';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
import { useAppData } from '@/ui/AppData';

const ACTIVE_KEY = 'timer:active';

interface ActiveTimer {
  habitId: string;
  date: string;          // "YYYY-MM-DD" (başladığı gün)
  startedAt: number;     // epoch ms
  baseSeconds: number;   // başlarken o gün birikmiş saniye
  targetSeconds: number; // hedef saniye
}

interface TimerApi {
  isRunning: (habitId: string) => boolean;
  // Aktif alışkanlık için canlı saniye (base + geçen), hedefte sınırlı; değilse null.
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

// Bir aktif zamanlayıcının şu ana kadar geçen (hedefte sınırlı) toplam saniyesi.
function elapsedOf(a: ActiveTimer): number {
  return Math.min(a.targetSeconds, a.baseSeconds + (Date.now() - a.startedAt) / 1000);
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { notifyDataChanged } = useAppData();
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [, setNow] = useState(Date.now()); // her saniye yeniden render tetikler
  // Interval/async içinde en güncel active'e erişmek için ref (kapanış bayatlamasın).
  const activeRef = useRef<ActiveTimer | null>(null);
  activeRef.current = active;

  const persist = (a: ActiveTimer | null) => {
    if (a) AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(a));
    else AsyncStorage.removeItem(ACTIVE_KEY);
  };

  // Aktif süreyi kalıcılaştır: geçen saniyeyi DB'ye ekle, bildirimi iptal et.
  const commit = useCallback((a: ActiveTimer) => {
    const delta = Math.round(elapsedOf(a) - a.baseSeconds);
    if (delta > 0) habitRepo.incrementAmount(a.habitId, a.date, delta, a.targetSeconds);
    cancelTimerDone(a.habitId);
  }, []);

  const stopActive = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    commit(a);
    setActive(null);
    persist(null);
    notifyDataChanged();
  }, [commit, notifyDataChanged]);

  // Açılışta kalıcı durumu geri yükle; kapalıyken hedef dolduysa hemen tamamla.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ACTIVE_KEY);
      if (!raw) return;
      try {
        const a = JSON.parse(raw) as ActiveTimer;
        if (elapsedOf(a) >= a.targetSeconds) {
          commit(a);
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

  // Aktifken her saniye: hedefe ulaşınca otomatik tamamla, yoksa render tetikle.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const a = activeRef.current;
      if (a && elapsedOf(a) >= a.targetSeconds) stopActive();
      else setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [active, stopActive]);

  const start = useCallback(
    (habitId: string) => {
      const habit = habitRepo.getById(habitId);
      if (!habit || habit.kind !== 'timer' || !habit.target_amount) return;
      const target = habit.target_amount;
      const date = todayDate();
      const base = habitRepo.getAmountOn(habitId, date);
      if (base >= target) return; // zaten tamamlanmış
      // Tek aktif zamanlayıcı: başkası çalışıyorsa önce onu kaydet.
      if (activeRef.current && activeRef.current.habitId !== habitId) {
        commit(activeRef.current);
        notifyDataChanged();
      }
      const a: ActiveTimer = {
        habitId,
        date,
        startedAt: Date.now(),
        baseSeconds: base,
        targetSeconds: target,
      };
      setActive(a);
      persist(a);
      scheduleTimerDone(habit, target - base);
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
