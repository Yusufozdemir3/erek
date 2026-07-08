// Ekranların paylaştığı renk paletleri (açık/koyu) ve ortak stiller.
// Karanlık mod: renkler artık statik değil — aktif palet ThemeProvider'dan
// useTheme() ile alınır. Ekranlar/bileşenler stillerini makeShared(colors) ve
// kendi makeStyles(colors) fabrikalarıyla render sırasında üretir.
// Geriye uyum: `colors` ve `shared` açık paletle export edilir (henüz taşınmamış
// bir yer kalırsa açık görünür, derleme bozulmaz).

import { StyleSheet } from 'react-native';
import type { Priority } from '@/db';

// Tek bir temanın tüm renk jetonları.
export interface Colors {
  bg: string;         // ekran zemini
  card: string;       // kart/panel zemini
  border: string;     // ince kenarlık
  line: string;       // biraz daha belirgin çizgi (checkbox kenarı, tutamaç)
  text: string;       // ana metin
  muted: string;      // ikincil metin
  faint: string;      // en soluk metin/placeholder
  primary: string;    // marka vurgusu
  primarySoft: string;// vurgunun soluk zemini (çip/rozet)
  done: string;       // tamamlandı (yeşil)
  streak: string;     // seri (turuncu)
  danger: string;     // sil/hata (kırmızı)
  track: string;      // ilerleme çubuğu/ızgara zemini
  inputBg: string;    // form girdisi zemini
  onAccent: string;   // renkli buton/işaret ÜSTÜ metin (iki modda da açık)
}

export const lightColors: Colors = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  line: '#cbd5e1',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  primary: '#4f46e5',
  primarySoft: '#e0e7ff',
  done: '#10b981',
  streak: '#f97316',
  danger: '#dc2626',
  track: '#eef2f7',
  inputBg: '#f8fafc',
  onAccent: '#ffffff',
};

export const darkColors: Colors = {
  bg: '#0b1120',
  card: '#1e293b',
  border: '#334155',
  line: '#475569',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#64748b',
  primary: '#818cf8',
  primarySoft: '#312e81',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#334155',
  inputBg: '#0f172a',
  onAccent: '#ffffff',
};

// Geriye uyumlu varsayılan (açık). Taşınmış bileşenler useTheme().colors kullanır.
export const colors: Colors = lightColors;

// Öncelik ve alışkanlık renkleri iki modda da aynı (canlı vurgular; koyuda da okunur).
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
};

// Öncelik seçicideki sıralama (düşükten yükseğe).
export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high'];

// Alışkanlık görsel kimliği için hazır emoji ve renk paletleri (seçici ızgaraları).
export const HABIT_ICONS = [
  '💧', '🏃', '📚', '🧘', '💪', '🥗', '😴', '🚭', '💊',
  '✍️', '🎯', '🌱', '🙏', '☕', '🧠', '🎵', '🎨', '🧹',
];
export const HABIT_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
];

// Alışkanlığın rengi yoksa kullanılacak varsayılan.
export const DEFAULT_HABIT_COLOR = '#6366f1';

// "YYYY-MM-DD" (ya da ISO) -> "28 Haz" gibi kısa etiket.
export function shortDate(value: string | null): string {
  if (!value) return 'Tarihsiz';
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
}

// "YYYY-MM-DD" (ya da ISO) -> "28 Haziran 2026" gibi uzun etiket.
export function longDateLabel(value: string | null): string {
  if (!value) return 'Tarihsiz';
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// "YYYY-MM-DD" -> gün adlı tam etiket ("Pazartesi, 29 Haziran 2026" gibi).
export function fullDateLabel(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Tarihli bir hedef/görev için kalan gün etiketini üretir.
export function deadlineLabel(ymd: string | null): string {
  if (!ymd) return '';
  const target = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff > 0) return `${diff} gün kaldı`;
  if (diff === 0) return 'Bugün son gün';
  return `${-diff} gün geçti`;
}

// Ortak stilleri aktif palete göre üretir. Bileşenler: const { shared } = useTheme().
export function makeShared(c: Colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 48 },

    greeting: { fontSize: 34, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 15, color: c.muted, marginTop: 2 },
    // Ekran başlığı + sağdaki profil ikonu satırı.
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 12 },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: c.text },
    badge: {
      marginLeft: 8,
      minWidth: 22,
      textAlign: 'center',
      fontSize: 13,
      fontWeight: '700',
      color: c.primary,
      backgroundColor: c.primarySoft,
      borderRadius: 11,
      paddingHorizontal: 6,
      paddingVertical: 1,
      overflow: 'hidden',
    },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: c.line,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxDone: { backgroundColor: c.done, borderColor: c.done },
    checkmark: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    cardBody: { flex: 1, paddingVertical: 4 },
    cardTitle: { flex: 1, fontSize: 15, color: c.text },
    cardTitleDone: { color: c.faint, textDecorationLine: 'line-through' },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },
    streak: { fontSize: 14, fontWeight: '700', color: c.streak },

    empty: { fontSize: 14, color: c.faint, paddingVertical: 8 },
  });
}

// Geriye uyumlu varsayılan ortak stiller (açık). Taşınmış ekranlar useTheme().shared kullanır.
export const shared = makeShared(lightColors);
