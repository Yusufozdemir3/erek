// Zamanlayıcı alışkanlığın SAF zaman matematiği — TimerProvider'dan bağımsız,
// UI'sız test edilebilir. Çalışan durum {startedAt, baseSeconds, targetSeconds}
// üçlüsünden türetilir; sayaç saklanmaz, duvar saatinden hesaplanır (uygulama
// kapansa da doğru). Tüm fonksiyonlar `now` parametresi alır (testlerde sabitlenir).
//
// GECE YARISI KARARI (bilinçli): Bir seans hangi günde BAŞLADIYSA o güne yazılır
// (ActiveTimer.date başlangıçta sabitlenir). 23:50'de başlayıp 00:20'de biten
// 30 dk, başlangıç gününün kaydına gider — alışkanlık seansı "o akşamın işi"dir;
// gece yarısında bölmek kullanıcı sezgisine katkısız karmaşıklık olurdu.

// Zamanlayıcı bir alışkanlığa (kind='timer') ya da süre-ölçümlü sayısal bir
// hedefe (unit=TIME_UNIT) bağlı olabilir — bkz. TimerProvider.
export type TimerKind = 'habit' | 'goal';

export interface ActiveTimer {
  kind: TimerKind;
  targetId: string;
  date: string;          // "YYYY-MM-DD" (başladığı gün — yukarıdaki karara bak; yalnız habit'te kullanılır)
  startedAt: number;     // epoch ms
  baseSeconds: number;   // başlarken birikmiş saniye
  targetSeconds: number; // hedef saniye
}

// Şu ana kadarki toplam saniye (base + geçen). Hedefte KIRPILMAZ — kullanıcı
// hedefi geçtikten sonra da zamanlayıcıyı istediği kadar çalıştırabilir.
// Saat geriye alınmışsa (now < startedAt) geçen süre negatife düşmez.
export function elapsedOf(a: ActiveTimer, now: number = Date.now()): number {
  const ran = Math.max(0, (now - a.startedAt) / 1000);
  return a.baseSeconds + ran;
}

// Duraklat/bitir anında DB'ye eklenecek saniye (bu seansta koşan kısım).
// Tam saniyeye yuvarlanır; hiçbir durumda negatif olmaz.
export function commitDelta(a: ActiveTimer, now: number = Date.now()): number {
  return Math.max(0, Math.round(elapsedOf(a, now) - a.baseSeconds));
}

// Hedefe ulaşıldı mı? (tamamlanma işaretlenmesi ve açılışta geri yükleme kararı —
// zamanlayıcı hedefte DURMAZ, yalnızca tamamlandı sayılır ve çalışmaya devam eder)
export function isFinished(a: ActiveTimer, now: number = Date.now()): boolean {
  return elapsedOf(a, now) >= a.targetSeconds;
}

// — SÜREÇ ÖLÜMÜNDEN SONRA GERİ YÜKLEME —
//
// Yukarıdaki duvar-saati modeli "zamanlayıcı arka planda da işlemeye devam eder"
// varsayımına dayanır ve uygulama AÇIKKEN doğrudur: kullanıcı 20 dk'lık hedefi
// aşıp 30 dk çalışmayı seçebilir, 30 dk'nın tamamı dürüstçe yazılır (bkz.
// commitDelta testleri). AMA süreç öldüğünde bu varsayım çöker: o aralıkta
// zamanlayıcı GERÇEKTEN çalışmıyordu, kalıcı durumdaki startedAt yalnızca "en son
// ne zaman başlatıldı"yı söyler.
//
// Düzeltilmeden önceki davranış: 20 dk hedefli bir seans akşam başlatılıp uygulama
// öldürülür ve iki gün sonra açılırsa, açılışta `elapsedOf` ~48 SAAT döndürüyor ve
// bunun tamamı seansın BAŞLADIĞI güne (a.date) yazılıyordu. Sonuç kalıcıydı:
// istatistikler ve (alışkanlık 'amount' modunda bir hedefe bağlıysa) hedef sayacı
// bozuluyor, üstelik kayıt bugüne değil GEÇMİŞ bir güne düştüğü için "Sıfırla"
// düğmesiyle bile düzeltilemiyordu.
//
// İki kural birlikte bunu kapatır ve uygulama açıkken hiçbir şeyi değiştirmez:

// 1) Seans "bayat" mı — yani süreç yeniden başladığında artık sürmüyor sayılmalı mı?
//    Gün değiştiyse (kayıt zaten geçmiş bir güne gidecekti) ya da hedef kapalıyken
//    dolduysa seans bitmiştir. Kullanıcı devam etmek isterse ▶ ile YENİ bir seans
//    başlatır; hiçbir veri kaybolmaz, çünkü biriken süre zaten DB'ye yazılmıştır.
export function isStaleSession(
  a: ActiveTimer,
  todayYmd: string,
  now: number = Date.now()
): boolean {
  return a.date !== todayYmd || isFinished(a, now);
}

// 2) Bayat bir seans kapatılırken yazılacak süre HEDEFE KALANLA sınırlıdır.
//    Süreç ölüyken hedefin aşıldığını varsayamayız (kimse başında değildi), ama
//    hedefe kadarki kısım kullanıcının başlattığı işin kendisidir ve korunur.
//    base zaten hedefteyse ya da üstündeyse 0 döner — o aralığa dair hiçbir şey
//    bilmiyoruz, uydurmuyoruz.
export function restoreCommitDelta(a: ActiveTimer, now: number = Date.now()): number {
  const room = Math.max(0, a.targetSeconds - a.baseSeconds);
  return Math.min(commitDelta(a, now), room);
}
