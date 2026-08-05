// TimerProvider bileşen testi — özellikle SÜREÇ ÖLÜMÜNDEN SONRA GERİ YÜKLEME
// yolu (bkz. lib/timerLogic.isStaleSession/restoreCommitDelta).
//
// NEDEN AYRICA GEREKLİ: timerLogic.test.ts o iki fonksiyonu SAF matematik olarak
// zaten kapsıyor (kritik P1 düzeltmesi). Ama asıl hata sınıfı BAĞLANTIDA yaşıyordu:
// "commit(a) yerine commit(a, restoreCommitDelta(a)) çağrılmalı" gibi bir kablo
// hatası, saf fonksiyon testlerinden hiçbirini kırmaz — ikisi de ayrı ayrı doğru
// çalışır, yalnızca biri diğerini YANLIŞ ARGÜMANLA çağırıyordur. Bu dosya
// TimerProvider'ın mount effect'ini gerçek AsyncStorage + gerçek habitRepo
// (in-memory SQLite) ile çalıştırıp DB'ye YAZILAN miktarı doğrular — yani
// tam olarak "bağlantı doğru mu" sorusunu sorar.
//
// TARİH HESABI: `todayDate()` (TimerProvider'ın kullandığı) YEREL saate göredir.
// Testte "bugün/dün" de aynı fonksiyonla hesaplanır — `toISOString().slice(0,10)`
// (UTC) kullanmak, testi çalıştıran makinenin UTC ofsetine göre YANLIŞ güne
// düşürüp testi kendi başına kırılgan kılardı.

import { useEffect } from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import { habitRepo, userRepo } from '@/db';
import { todayDate } from '@/lib/helpers';
import { resetTestDb } from '@/test/dbTestUtils';
import { renderUI } from '@/test/renderWithProviders';
import { TimerProvider, useTimer } from '@/ui/TimerProvider';

const ACTIVE_KEY = 'timer:active';
const DAY_MS = 86_400_000;
const mockNotifyDataChanged = jest.fn();

function daysAgo(n: number): string {
  const d = new Date(`${todayDate()}T00:00:00`);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

jest.mock('@/ui/AppData', () => ({
  useAppData: () => ({ notifyDataChanged: mockNotifyDataChanged }),
}));

// Bildirim iptali yan etkidir; bu testin konusu değil.
jest.mock('@/lib/notifications', () => ({
  cancelTimerDone: jest.fn(async () => {}),
  scheduleTimerDone: jest.fn(async () => {}),
}));

jest.mock('@/lib/haptics', () => ({ notifySuccess: jest.fn() }));

// TimerProvider'ın context'ini dışarı sızdıran minik prob — testin ihtiyacı olan
// tek şey `active()`'in geri yüklemeden sonra null olduğunu görmek.
function Probe({ onReady }: { onReady: (api: ReturnType<typeof useTimer>) => void }) {
  const timer = useTimer();
  useEffect(() => {
    onReady(timer);
  }, [timer, onReady]);
  return <Text />;
}

let userId: string;

beforeEach(async () => {
  await resetTestDb();
  await AsyncStorage.clear();
  userId = userRepo.getOrCreateLocal().id;
  mockNotifyDataChanged.mockClear();
});

describe('TimerProvider — süreç ölümünden sonra geri yükleme', () => {
  it('İKİ GÜN KAPALI KALAN SEANS: DB\'ye 48 saat değil, hedefe kalan kadarı yazılır', async () => {
    // Düzeltilen hata tam olarak buydu (bkz. TimerProvider dosya başı yorumu):
    // 20 dk hedefli bir seans akşam başlatılıp uygulama öldürülür ve iki gün sonra
    // açılırsa, geçen sürenin TAMAMI habit_logs.amount'a yazılıyordu.
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 20 * 60, // 20 dk hedef
    });
    const yesterday = daysAgo(2);
    // Kalıcı durum: iki gün önce, o günün tarihiyle, sıfır birikimle başlamış.
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: yesterday,
        startedAt: Date.now() - 2 * DAY_MS,
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    // Async geri yükleme (AsyncStorage okuma + DB yazma) bitene kadar bekle —
    // tek bir `act(async () => {})` paralel koşuda mikro görevin tamamının
    // aktığını garanti etmez; waitFor gerçek sonucu poll'lar.
    await waitFor(() => expect(habitRepo.getAmountOn(habit.id, yesterday)).toBe(20 * 60));

    // Seans KAPANMALI — bayat bir seansla çalışmaya devam etmemeli.
    expect(api!.active()).toBeNull();
    expect(api!.isRunning('habit', habit.id)).toBe(false);
    // Kalıcı durum temizlendi — bir sonraki açılışta aynı seans tekrar işlenmez.
    expect(await AsyncStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it('TAZE SEANS (aynı gün, hedef dolmamış): olduğu yerden devam eder', async () => {
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 20 * 60,
    });
    const today = todayDate();
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: today,
        startedAt: Date.now() - 5 * 60_000, // 5 dk önce başladı
        baseSeconds: 0,
        targetSeconds: 20 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    // Kısa bir çökme/yeniden başlatma seansı BOZMAMALI — hâlâ çalışıyor sayılır.
    await waitFor(() => expect(api!.isRunning('habit', habit.id)).toBe(true));
    // DB'ye henüz hiçbir şey YAZILMADI — commit yalnız duraklat/bitirde olur.
    expect(habitRepo.getAmountOn(habit.id, today)).toBe(0);
  });

  it('kapalıyken hedef TAM dolmuşsa (bayat + hedefte) seans kapanır, hedef kadar yazılır', async () => {
    const habit = habitRepo.create({
      user_id: userId,
      title: 'Kitap oku',
      kind: 'timer',
      target_amount: 10 * 60,
    });
    const today = todayDate();
    await AsyncStorage.setItem(
      ACTIVE_KEY,
      JSON.stringify({
        kind: 'habit',
        targetId: habit.id,
        date: today,
        startedAt: Date.now() - 30 * 60_000, // 30 dk önce — hedefi (10 dk) çoktan aştı
        baseSeconds: 0,
        targetSeconds: 10 * 60,
      })
    );

    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    await waitFor(() => expect(habitRepo.getAmountOn(habit.id, today)).toBe(10 * 60)); // 30 dk değil, hedef kadar
    expect(api!.active()).toBeNull();
  });

  it('kalıcı durum yoksa hiçbir şey yapmaz (temiz açılış)', async () => {
    let api: ReturnType<typeof useTimer> | null = null;
    await renderUI(
      <TimerProvider>
        <Probe onReady={(t) => (api = t)} />
      </TimerProvider>
    );

    await waitFor(() => expect(api).not.toBeNull());
    expect(api!.active()).toBeNull();
  });
});
