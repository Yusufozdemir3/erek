// Alışkanlık PUANININ saf matematiği — UI'sız, test edilebilir (timerLogic.ts /
// goalProjection.ts ile aynı gerekçe). useHabitStats bunu çağırır.
//
// Puan, günlük/haftalık/aylık tamamlanma oranlarının üstel hareketli
// ortalamasıdır (EMA): son kovalar daha ağır basar, tek bir kötü gün grafiği
// uçurmaz. Katsayı 0.2 iken tek günün etkisi fazla hissediliyordu (kullanıcı
// geri bildirimi) — 0.07'ye düşürüldü.
//
// — YANLILIK DÜZELTMESİ (2026-07-21, denetim bulgusu #21) —
// Eski sürüm EMA'yı İLK ORANLA tohumluyordu (`prev = i===0 ? r : ...`) ve
// hesabı alışkanlığın DOĞUMUNDAN ÖNCEKİ kovaları da (oran=0) kapsayacak şekilde
// çalıştırıyordu. İki ayrı çarpıklık üretiyordu:
//
//   1) "Henüz var olmamak" ile "vardı ve yapılmadı" aynı sinyaldi (ikisi de 0).
//      10 gündür var olan KUSURSUZ bir alışkanlık %51,6 gösteriyordu — üstelik
//      80 gün hiç yapılmamış, son 10 günde toparlamış bir alışkanlıkla BİREBİR
//      AYNI puanı. Aynı ekrandaki "Tamamlanma" kartı ise %100 diyordu.
//   2) Sadece (1)'i düzeltip ilk oranla tohumlamak ayna görüntüsü hata verirdi:
//      "1 gün yaptım, 6 gün kaçırdım" -> %64,7 (gerçek %14,3), çünkü ilk gün
//      tüm ağırlığı taşırdı.
//
// Çözüm: EMA sıfırdan başlar (tohum yok) ve her adımda (1-(1-alpha)^t) ile
// normalize edilir. Bu, az veride düz ortalamaya yakınsar, veri biriktikçe
// standart EMA'ya döner — güncellik ağırlığı korunur. Çağıran ayrıca kovaları
// alışkanlığın doğumundan itibaren keser (bkz. useHabitStats.buildSeries), yani
// hayalet sıfırlar diziye hiç girmez.
export const SCORE_EMA_ALPHA = 0.07;

// Puan kartının açılması için gereken EN AZ yaşanan gün sayısı. Altındayken
// sayı MATEMATİKSEL olarak doğrudur ama anlamlı değildir (2 günlük veriden
// "puan" çıkarmak bugünü tekrar etmekten ibarettir), o yüzden gösterilmez —
// kullanıcıya kaç gün kaldığı söylenir (bkz. useHabitStats.scoreUnlockInDays).
export const SCORE_MIN_DAYS = 7;

// 0..1 oranlar dizisi -> aynı uzunlukta 0..1 puan dizisi.
// Boş dizi boş döner. alpha yalnızca testler için parametrik.
export function emaScores(ratios: number[], alpha: number = SCORE_EMA_ALPHA): number[] {
  const out: number[] = [];
  let acc = 0;
  ratios.forEach((r, i) => {
    acc = acc * (1 - alpha) + r * alpha;
    // Yanlılık düzeltmesi: t adım sonra ağırlıkların toplamı (1-(1-alpha)^t)'dir;
    // buna bölmek "eksik ağırlığı" telafi eder. t büyüdükçe payda 1'e gider ve
    // ifade standart EMA'ya döner.
    const bias = 1 - Math.pow(1 - alpha, i + 1);
    out.push(bias > 0 ? acc / bias : r);
  });
  return out;
}
