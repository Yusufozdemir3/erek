// Ekranların paylaştığı renkler ve ortak stiller.
// Tek yerde tutulur ki kart/giriş/kutu görünümü tüm sekmelerde tutarlı olsun
// ve her ekranda yeniden tanımlanmasın.

import { StyleSheet } from 'react-native';
import type { Priority } from '@/db';

export const colors = {
  bg: '#f8fafc',
  card: '#fff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  primary: '#4f46e5',
  primarySoft: '#e0e7ff',
  done: '#10b981',
  streak: '#f97316',
};

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
export const DEFAULT_HABIT_COLOR = colors.primary;

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

export const shared = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48 },

  greeting: { fontSize: 34, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  badge: {
    marginLeft: 8,
    minWidth: 22,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  addRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: {
    width: 46,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, lineHeight: 26, fontWeight: '600' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.done, borderColor: colors.done },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  cardBody: { flex: 1, paddingVertical: 4 },
  cardTitle: { flex: 1, fontSize: 15, color: colors.text },
  cardTitleDone: { color: colors.faint, textDecorationLine: 'line-through' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  streak: { fontSize: 14, fontWeight: '700', color: colors.streak },

  empty: { fontSize: 14, color: colors.faint, paddingVertical: 8 },
});
