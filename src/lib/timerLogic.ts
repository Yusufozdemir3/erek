// Zamanlayıcı alışkanlığın SAF zaman matematiği — TimerProvider'dan bağımsız,
// UI'sız test edilebilir. Çalışan durum {startedAt, baseSeconds, targetSeconds}
// üçlüsünden türetilir; sayaç saklanmaz, duvar saatinden hesaplanır (uygulama
// kapansa da doğru). Tüm fonksiyonlar `now` parametresi alır (testlerde sabitlenir).
//
// GECE YARISI KARARI (bilinçli): Bir seans hangi günde BAŞLADIYSA o güne yazılır
// (ActiveTimer.date başlangıçta sabitlenir). 23:50'de başlayıp 00:20'de biten
// 30 dk, başlangıç gününün kaydına gider — alışkanlık seansı "o akşamın işi"dir;
// gece yarısında bölmek kullanıcı sezgisine katkısız karmaşıklık olurdu.

export interface ActiveTimer {
  habitId: string;
  date: string;          // "YYYY-MM-DD" (başladığı gün — yukarıdaki karara bak)
  startedAt: number;     // epoch ms
  baseSeconds: number;   // başlarken o gün birikmiş saniye
  targetSeconds: number; // hedef saniye
}

// Şu ana kadarki toplam saniye (base + geçen), HEDEFTE SINIRLI.
// Saat geriye alınmışsa (now < startedAt) geçen süre negatife düşmez.
export function elapsedOf(a: ActiveTimer, now: number = Date.now()): number {
  const ran = Math.max(0, (now - a.startedAt) / 1000);
  return Math.min(a.targetSeconds, a.baseSeconds + ran);
}

// Duraklat/bitir anında DB'ye eklenecek saniye (bu seansta koşan kısım).
// Tam saniyeye yuvarlanır; hiçbir durumda negatif olmaz.
export function commitDelta(a: ActiveTimer, now: number = Date.now()): number {
  return Math.max(0, Math.round(elapsedOf(a, now) - a.baseSeconds));
}

// Hedefe ulaşıldı mı? (otomatik tamamlama ve açılışta geri yükleme kararı)
export function isFinished(a: ActiveTimer, now: number = Date.now()): boolean {
  return elapsedOf(a, now) >= a.targetSeconds;
}
