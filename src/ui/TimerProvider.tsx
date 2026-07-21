// Zamanlayıcı motoru — hem alışkanlık (kind='timer') hem süre-ölçümlü sayısal
// hedef (unit=TIME_UNIT, bkz. helpers.ts) için ORTAK (Aşama C: bağımsız sayaç).
// Aynı anda tek bir zamanlayıcı çalışır — türü/hedefi ne olursa olsun. Çalışan
// durum AsyncStorage'da tutulur; böylece uygulama kapansa/arka plana atılsa da
// süre gerçek duvar-saatiyle işler (startedAt damgasından hesaplanır).
// Duraklat/bitir'de biriken saniye ilgili yere yazılır: habit → habitRepo.
// incrementAmount (habit_logs.amount), goal → goalRepo.addProgress (current_value
// + goal_entries, tempo/projeksiyon otomatik faydalanır). Hedefe ulaşınca
// completed=1/current_value=target olur AMA zamanlayıcı DURMAZ — kullanıcı
// isterse hedefi aşarak çalışmaya devam edebilir (celebratedRef, oturum başına
// tek seferlik commit+haptik+bildirim-iptali sağlar). Bildirim hedef anına kurulur.
//
// Tek doğru kaynak yine SQLite: bu modül yalnızca "şu an ne kadar süre geçti"nin
// geçici (çalışan) durumunu ve tik'i yönetir; kalıcı toplam DB'dedir.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { goalRepo, habitRepo } from '@/db';
import { isTimeUnit, todayDate } from '@/lib/helpers';
import { notifySuccess } from '@/lib/haptics';
import { cancelTimerDone, scheduleTimerDone } from '@/lib/notifications';
// Saf zaman matematiği ayrı modülde (test edilebilir); gece yarısı kararı da orada.
import { commitDelta, elapsedOf, isFinished, type ActiveTimer, type TimerKind } from '@/lib/timerLogic';
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

  // Aktif süreyi kalıcılaştır: geçen saniyeyi ilgili yere ekle, bildirimi iptal et.
  const commit = useCallback((a: ActiveTimer) => {
    const delta = commitDelta(a);
    if (delta > 0) {
      if (a.kind === 'habit') habitRepo.incrementAmount(a.targetId, a.date, delta, a.targetSeconds);
      else goalRepo.addTimeProgress(a.targetId, delta);
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

  // Açılışta kalıcı durumu geri yükle. Kapalıyken hedef dolduysa ilerlemeyi
  // hemen DB'ye yaz (tamamlandı sayılsın) ama zamanlayıcıyı DURDURMA —
  // kullanıcı isterse çalışmaya devam etsin.
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

  const isRunning = (kind: TimerKind, id: string) => active?.kind === kind && active?.targetId === id;
  const liveSeconds = (kind: TimerKind, id: string) =>
    isRunning(kind, id) ? elapsedOf(active!) : null;
  const activeFn = () => (active ? { kind: active.kind, id: active.targetId } : null);

  return (
    <TimerContext.Provider value={{ isRunning, liveSeconds, active: activeFn, start, pause, reset }}>
      {children}
    </TimerContext.Provider>
  );
}
