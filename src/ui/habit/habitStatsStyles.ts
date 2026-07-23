// Alışkanlık İSTATİSTİK ekranının stil fabrikası — app/habit/[id].tsx'ten
// AYRILDI (goal/goalStyles.ts ile aynı gerekçe: ekran dosyası 750 satırdı,
// stiller tek başına ~145 satır ve grafik alt bileşenleri de aynı sözlüğü
// paylaşıyor).
//
// DESEN (bkz. ThemeProvider): modül seviyesinde StyleSheet.create YOK — tema
// değişince yeniden üretilebilsin diye fabrika render sırasında çağrılır.

import { StyleSheet } from 'react-native';
import type { Colors } from '@/ui/theme';

// — 'Geçmiş' çubuk grafiğinin ÖLÇÜLERİ — hem stiller hem çizim mantığı kullanır —
// Ekrana AYNI ANDA kaç kova sığar. Sütun genişliği bundan türer: eskiden tüm
// kovalar sığdırılmaya çalışılıyordu (13-14 çubuk yan yana) ve grafik okunmaz
// derecede kalabalıklaşıyordu (kullanıcı geri bildirimi). Kalan kovalar
// KAYBOLMAZ — yatay kaydırmayla gelirler, açılışta en güncel uçta durulur.
export const HISTORY_VISIBLE_COLS = 7;
// Çubuk alanı ölçüleri. statsHistoryRow/Label stilleri de bunlardan türer ki
// çubuk yüksekliğini burada PİKSEL olarak hesaplayabilelim (yüzde değil) —
// değer yazısının çubuğa sığıp sığmadığına ancak öyle karar verilebiliyor.
export const HISTORY_ROW_H = 190;
export const HISTORY_LABEL_H = 16;
export const HISTORY_LABEL_GAP = 6;
export const HISTORY_TRACK_H = HISTORY_ROW_H - HISTORY_LABEL_H - HISTORY_LABEL_GAP;
// Değer yazısı çubuğun İÇİNDE ve YATAY. Bir ara 90° döndürülmüştü: sütun 26px
// iken sayı çubuğa yatay sığmıyordu. HISTORY_VISIBLE_COLS=7 ile sütun ~50px'e,
// çubuk ~33px'e çıkınca ("18.3k" ≈ 22px) döndürmeye gerek kalmadı — yatay yazı
// hem okunaklı hem de dikeydeki "yazı çubuktan uzun" sorununu tamamen bitirdi:
// artık sığma koşulu yazının UZUNLUĞU değil, tek satır yüksekliği.
export const HISTORY_VALUE_LINE = 12; // yazı satırının yüksekliği
export const HISTORY_VALUE_INSET = 4; // içeri yazarken çubuğun tepesinden boşluk
// Bu boydan kısa çubukta satır içeri sığmaz, yazı çubuğun ÜSTÜNE çıkar.
export const HISTORY_VALUE_MIN_BAR = HISTORY_VALUE_LINE + HISTORY_VALUE_INSET * 2;

export type HabitStatsStyles = ReturnType<typeof makeHabitStatsStyles>;

export const makeHabitStatsStyles = (c: Colors) =>
  StyleSheet.create({
    backRow: { marginBottom: 12 },
    backText: { fontSize: 15, fontWeight: '700', color: c.primary },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    statCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 12, color: c.muted, marginTop: 4, textAlign: 'center' },

    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    cardLabel: { fontSize: 13, color: c.muted, fontWeight: '600' },
    cardValue: { fontSize: 20, fontWeight: '800', color: c.text, marginTop: 4 },

    // — Streak rozetleri —
    // Yalnız KAZANILAN rozetler madalya olarak dizilir (kilitli vitrin kalktı).
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    badge: {
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      backgroundColor: c.primarySoft,
      borderColor: c.primary,
    },
    badgeEmoji: { fontSize: 24 },
    badgeLabel: { fontSize: 11, color: c.muted, marginTop: 2 },
    // — Sıradaki rozet: emoji + ad + kalan gün, altında ilerleme çubuğu —
    badgeNextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    badgeNextEmoji: { fontSize: 16, opacity: 0.5 },
    badgeNextLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: c.text },
    badgeNextLeft: { fontSize: 12, fontWeight: '600', color: c.muted },
    badgeTrack: { height: 6, borderRadius: 3, backgroundColor: c.track, overflow: 'hidden', marginTop: 8 },
    badgeFill: { height: '100%', borderRadius: 3 },
    badgeAllEarned: { fontSize: 13, fontWeight: '700', color: c.text },

    // Kaçırılan gün (aylık takvim): iki temada da okunur bir kırmızı. Planlı
    // değil: zeminden ayrılan soluk gri (bg değil — bg zeminle aynı olup görünmez
    // kalıyordu).
    cellMissed: { backgroundColor: '#f87171' },
    cellUnscheduled: { backgroundColor: c.border },

    // — Gün/Hafta/Ay sekmeleri (Puan + Geçmiş paylaşır) —
    periodBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.inputBg,
    },
    periodBtnSel: { borderColor: c.primary, backgroundColor: c.primarySoft },
    periodText: { fontSize: 12, fontWeight: '700', color: c.faint },
    periodTextSel: { color: c.primary },

    // — Ay takvimi —
    calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    calNavBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calNavBtnDisabled: { opacity: 0.4 },
    calMonthLabel: { fontSize: 15, fontWeight: '700', color: c.text },
    calWeekHead: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
    calWeekHeadText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.faint },
    calRow: { flexDirection: 'row' },
    calCell: { flex: 1, aspectRatio: 1, margin: 2, alignItems: 'center', justifyContent: 'center' },
    calCellFilled: { borderRadius: 8, backgroundColor: c.track },
    calDayText: { fontSize: 12, fontWeight: '600', color: c.muted },
    calDayTextOn: { color: c.onAccent, fontWeight: '800' },

    // — Hedef/Puan/Geçmiş kartı — Claude Design mockup'ının (Tur 9, kart 9a)
    // DÜZEN/YAPI portu. Renkler İSE mockup'tan sabit kopyalanmadı, uygulamanın
    // kendi tema tokenlerinden (c.*) gelir — aksi halde bu bölüm açık/koyu tema
    // değişse de hep aynı donuk siyah kalır, ekrana yapıştırılmış bir görsel
    // gibi durur (kullanıcı geri bildirimi: "fotoğraf gibi durdu"). Koyu temada
    // (özellikle "Tam Siyah" stilinde, bkz. theme.ts blackColors) zaten mockup'a
    // çok yakın bir görünüm veriyor — ama artık GERÇEKTEN kodlanmış, dondurulmuş
    // bir asset değil.
    statsCard: {
      backgroundColor: c.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    statsSection: { padding: 20 },
    statsSectionBordered: { borderTopWidth: 1, borderTopColor: c.border },
    statsEyebrow: { color: c.faint, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 14 },
    statsGoalHeadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    statsGoalLabel: { color: c.muted, fontSize: 11, fontWeight: '600' },
    statsGoalValue: { color: c.text, fontSize: 11, fontWeight: '600' },
    statsGoalTrack: { height: 1, backgroundColor: c.border },
    statsGoalFill: { position: 'absolute', left: 0, top: -1, height: 3, backgroundColor: c.text, borderRadius: 1.5 },
    statsHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    statsPeriodRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 4 },
    statsPeriodBtn: { paddingHorizontal: 10, paddingVertical: 5 },
    statsTitle: { color: c.text, fontSize: 14, fontWeight: '700', letterSpacing: 1 },
    statsMeta: { color: c.faint, fontSize: 11, fontWeight: '600' },
    // ÖLÇEK: Puan grafiğiyle (ScoreLineChart) AYNI orana çekildi — eski değerler
    // (120px sıra, 8/7px yazı) telefonda okunmuyordu ve Puan büyütülünce iki kart
    // yan yana dengesiz duruyordu (kullanıcı geri bildirimi). Ölçüler HISTORY_*
    // sabitlerinden gelir; çubuk yüksekliği orada piksel olarak hesaplanıyor.
    statsHistoryRow: { flexDirection: 'row', alignItems: 'flex-end', height: HISTORY_ROW_H, marginTop: 4 },
    statsHistoryCol: { height: '100%', alignItems: 'center' },
    // Genişlik/konum/renk çizim sırasında veriliyor (sütun ve çubuk boyuna bağlı).
    statsHistoryValue: {
      position: 'absolute',
      left: 0,
      height: HISTORY_VALUE_LINE,
      lineHeight: HISTORY_VALUE_LINE,
      fontSize: 9,
      fontWeight: '700',
      textAlign: 'center',
    },
    statsHistoryBarTrack: { flex: 1, width: '65%', justifyContent: 'flex-end' },
    statsHistoryBar: { width: '100%', borderRadius: 6, minHeight: 4 },
    statsHistoryLabel: {
      fontSize: 10,
      lineHeight: HISTORY_LABEL_H,
      fontWeight: '600',
      color: c.faint,
      marginTop: HISTORY_LABEL_GAP,
    },
  });
