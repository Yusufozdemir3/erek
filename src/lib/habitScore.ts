// Alışkanlık PUANININ saf matematiği — UI'sız, test edilebilir (timerLogic.ts /
// goalProjection.ts ile aynı gerekçe). useHabitStats bunu çağırır.
//
// MODEL (2026-07-23, kullanıcı kararı): puan SIFIRDAN BAŞLAR ve KAZANILIR.
// Yeni bir alışkanlık ilk gün kusursuz olsa bile %100 göstermez; her tamamlanan
// kova puanı hedefe biraz daha yaklaştırır, kaçırılan kova geri çeker. Referans
// davranış Loop Habit Tracker (kullanıcının beğendiği grafik).
//
// İki girdi kuralı:
//   1) ratio = 0..1  -> kova EMA'yı günceller (yapıldı / kısmen yapıldı / kaçtı)
//   2) ratio = null  -> NÖTR kova: puan güncellenmez, bir öncekiyle AYNI kalır.
//      "Bugün bu alışkanlığın günü değildi" ile "yapman gerekiyordu, yapmadın"
//      artık aynı sinyal DEĞİL. Nötr kova diziden atılmaz, çizgi kesintisiz
//      aksın diye aynı puanla tekrar edilir (kullanıcı isteği: "grafik
//      devamlılığı göstersin").
//
// — TARİHÇE: neden yanlılık düzeltmesi YOK —
// Bir ara (denetim #21) EMA `acc / (1-(1-alpha)^t)` ile normalize ediliyordu;
// amacı "10 gündür kusursuz alışkanlık neden %51,6 gösteriyor" şikâyetiydi.
// Yan etkisi: puan ilk kovada hemen %100'e fırlıyordu — yani kazanılan değil,
// peşin verilen bir puan. Kullanıcı bunun yerine sıfırdan tırmanan puanı seçti,
// düzeltme kaldırıldı. #21'in ASIL bulgusu (doğumdan önceki hayalet kovalar
// puanı düşürüyordu) bu modelde kendiliğinden yok olur: baştaki sıfırlar puanı
// zaten 0'da tutar, ilk gerçek kovadan itibaren tırmanış aynıdır. Kesme
// (useHabitStats.trimLeading) artık yalnızca GÖRÜNÜM içindir (10 ay boş çubuk
// göstermemek), matematiği etkilemez.
//
// BİLİNEN SONUÇ: "yeni ve kusursuz" ile "uzun süre batık, son 10 gündür
// toparlanan" alışkanlık ilk haftalarda benzer puan gösterir. Puanın kazanılan
// bir şey olmasının doğal bedeli — ayrıştırmak istersek Tamamlanma/seri
// kartları bu ayrımı zaten veriyor.
//
// Katsayı 0.2 iken tek günün etkisi fazla hissediliyordu (kullanıcı geri
// bildirimi) — 0.07'ye düşürüldü. Gün kovasında yarılanma ~9,6 gün.
export const SCORE_EMA_ALPHA = 0.07;

// Hafta ve ay kovaları için TAKVİM-EŞDEĞERİ katsayılar. Üç sekmede de tek bir
// alpha kullanmak, aynı alışkanlığı Gün'de %94 Hafta'da %58 gösteriyordu (aynı
// ekranda çelişki — kullanıcı bu sınıf tutarsızlığı daha önce de bildirmişti).
// Bir haftalık kova 7 günlük sönümlemeye, bir aylık kova 30 günlüğe denk gelsin:
export const SCORE_EMA_ALPHA_WEEK = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 7);
export const SCORE_EMA_ALPHA_MONTH = 1 - Math.pow(1 - SCORE_EMA_ALPHA, 30);

// NOT: Bir zamanlar SCORE_MIN_DAYS=7 kilidi vardı ("Puan 7 gün sonra açılır").
// KALDIRILDI (2026-07-23): puan artık peşin verilmiyor, 0'dan tırmanıyor — ilk
// günlerin düşük değeri yanıltıcı bir sayı değil, modelin kendisi. Kilit tam da
// görülmek istenen tırmanışın başını gizliyordu.

// Oran dizisi -> aynı uzunlukta 0..1 puan dizisi. Puan 0'dan başlar.
// null = nötr kova (puan taşınır, EMA güncellenmez). Boş dizi boş döner.
// alpha çağırana aittir (gün/hafta/ay için farklı — yukarıdaki sabitler).
export function emaScores(
  ratios: Array<number | null>,
  alpha: number = SCORE_EMA_ALPHA
): number[] {
  const out: number[] = [];
  let score = 0;
  for (const r of ratios) {
    if (r !== null) score = score * (1 - alpha) + r * alpha;
    out.push(score);
  }
  return out;
}
