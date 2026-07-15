// Ekranların paylaştığı renk paletleri (açık/koyu) ve ortak stiller.
// Karanlık mod: renkler artık statik değil — aktif palet ThemeProvider'dan
// useTheme() ile alınır. Ekranlar/bileşenler stillerini makeShared(colors) ve
// kendi makeStyles(colors) fabrikalarıyla render sırasında üretir.
// Geriye uyum: `colors` ve `shared` açık paletle export edilir (henüz taşınmamış
// bir yer kalırsa açık görünür, derleme bozulmaz).

import { StyleSheet } from 'react-native';
import type { Priority } from '@/db';
import type { Lang } from '@/i18n/translations';

// Aktif dile karşılık gelen Intl/Date yerel ayarı (ay/gün adları için).
export const DATE_LOCALE: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US', de: 'de-DE' };

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

// Sıcak mürekkep: kahverengiye çalan neredeyse-siyah zemin (soğuk slate/lacivert
// yerine) — açık moddaki krem zeminle (#F4F1EA) aynı ailede durur, metin rengi de
// o kremle birebir aynıdır. İki mod böylece aynı editorial kimliğin parçası gibi
// hisseder (bkz. vurgu renkleri: çam/kiremit/mürekkep/bordo/hardal de sıcak tonlar).
export const darkColors: Colors = {
  bg: '#161412',
  card: '#211f1c',
  border: '#3a3632',
  line: '#4a453f',
  text: '#f4f1ea',
  muted: '#a8a29a',
  faint: '#78726a',
  primary: '#818cf8',
  primarySoft: '#312e81',
  done: '#34d399',
  streak: '#fb923c',
  danger: '#f87171',
  track: '#3a3632',
  inputBg: '#1c1a17',
  onAccent: '#ffffff',
};

// Geriye uyumlu varsayılan (açık). Taşınmış bileşenler useTheme().colors kullanır.
export const colors: Colors = lightColors;

// Vurgu rengi (marka rengi) — kullanıcı Profil'den seçer, AsyncStorage'da saklanır
// (bkz. ThemeProvider). Yalnızca primary/primarySoft'u geçersiz kılar; done/danger/
// streak gibi anlamlı renkler ve zemin/metin tonları temadan (açık/koyu) gelmeye
// devam eder — vurgu rengi yalnızca "marka" anlamına gelir.
export type AccentKey = 'pine' | 'terracotta' | 'ink' | 'indigo' | 'wine' | 'mustard';

interface AccentPalette {
  primary: string;
  primarySoft: string;
}

export const ACCENT_THEMES: Record<AccentKey, { light: AccentPalette; dark: AccentPalette }> = {
  pine: {
    light: { primary: '#2F5D45', primarySoft: '#DCE8DF' },
    dark: { primary: '#6FA98A', primarySoft: '#1E3B2C' },
  },
  terracotta: {
    light: { primary: '#C0532E', primarySoft: '#F5D9CC' },
    dark: { primary: '#E08A65', primarySoft: '#4A2418' },
  },
  ink: {
    light: { primary: '#1E3A5F', primarySoft: '#DAE3EE' },
    dark: { primary: '#7FA8D6', primarySoft: '#1C3450' },
  },
  indigo: {
    light: { primary: '#4f46e5', primarySoft: '#e0e7ff' },
    dark: { primary: '#818cf8', primarySoft: '#312e81' },
  },
  wine: {
    light: { primary: '#7A2E3A', primarySoft: '#F0D9DD' },
    dark: { primary: '#C97A88', primarySoft: '#3D1820' },
  },
  mustard: {
    light: { primary: '#96591A', primarySoft: '#F0DFC0' },
    dark: { primary: '#D9A24B', primarySoft: '#402E10' },
  },
};

// Profil ekranındaki seçici sırası; ilk eleman varsayılan vurgu rengidir.
export const ACCENT_ORDER: AccentKey[] = ['pine', 'terracotta', 'ink', 'indigo', 'wine', 'mustard'];
export const DEFAULT_ACCENT: AccentKey = 'pine';

// Öncelik ve alışkanlık renkleri iki modda da aynı (canlı vurgular; koyuda da okunur).
export const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

// Öncelik seçicideki sıralama (düşükten yükseğe).
export const PRIORITY_ORDER: Priority[] = ['low', 'medium', 'high'];

// Alışkanlık renk paleti (ikon seti için bkz. src/ui/habitIcons.tsx — eskiden
// burada ham emoji listesi vardı, çizgi vektör ikon setine geçildi).
export const HABIT_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
];

// Alışkanlığın rengi yoksa kullanılacak varsayılan.
export const DEFAULT_HABIT_COLOR = '#6366f1';

// "YYYY-MM-DD" (ya da ISO) -> "28 Haz" gibi kısa etiket. lang belirler hangi
// yerel ayarla (ay adı vb.) biçimlensin; noDateLabel değer yoksa gösterilecek
// çevrilmiş metin (çağıran t('date.noDate') verir).
export function shortDate(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'short',
  });
}

// "YYYY-MM-DD" (ya da ISO) -> "28 Haziran 2026" gibi uzun etiket.
export function longDateLabel(value: string | null, lang: Lang = 'tr', noDateLabel = 'Tarihsiz'): string {
  if (!value) return noDateLabel;
  const ymd = value.slice(0, 10);
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// "YYYY-MM-DD" -> gün adlı tam etiket ("Pazartesi, 29 Haziran 2026" gibi).
export function fullDateLabel(ymd: string, lang: Lang = 'tr'): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString(DATE_LOCALE[lang], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Tarihli bir hedef/görev için kalan gün etiketini üretir. Çevrilmiş parçalar
// (kaç gün kaldı/geçti, "bugün son gün") çağırandan (t()) alınır.
export function deadlineLabel(
  ymd: string | null,
  labels: { daysLeft: (n: number) => string; dueToday: string; daysAgo: (n: number) => string }
): string {
  if (!ymd) return '';
  const target = new Date(`${ymd}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff > 0) return labels.daysLeft(diff);
  if (diff === 0) return labels.dueToday;
  return labels.daysAgo(-diff);
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
    streak: { fontSize: 14, fontWeight: '700', color: c.streak },

    empty: { fontSize: 14, color: c.faint, paddingVertical: 8 },
  });
}

// Geriye uyumlu varsayılan ortak stiller (açık). Taşınmış ekranlar useTheme().shared kullanır.
export const shared = makeShared(lightColors);
