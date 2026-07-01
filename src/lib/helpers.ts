// Repository'lerin paylaştığı küçük yardımcılar.

import * as Crypto from 'expo-crypto';
import type { Recurrence } from '../types/models';

// Cihazda UUID üretir. Offline'da bile çakışmayan ID için kritik.
export function newId(): string {
  return Crypto.randomUUID();
}

// Şu anın ISO 8601 zaman damgası. updated_at için kullanılır.
export function nowIso(): string {
  return new Date().toISOString();
}

// Bugünün tarihi "YYYY-MM-DD" formatında (alışkanlık logları için).
// Yerel saat dilimine göre - kullanıcının "bugün"ü neyse o.
export function todayDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// JSON alanları güvenli parse/stringify (recurrence gibi).
export function parseJson<T>(value: string | null): T | null {
  if (value == null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toJson(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

// Gün adları, JS getDay() sırasıyla (0=Pazar ... 6=Cumartesi).
const WEEKDAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
// Görüntüleme sırası: Pazartesi'den Pazar'a.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Bir tekrar kuralı verilen günde ("YYYY-MM-DD") geçerli mi? null = her gün.
// Alışkanlığın o gün "vadeli/planlı" olup olmadığını belirler (streak + Bugün filtresi).
export function isScheduledOn(schedule: Recurrence | null, dateYmd: string): boolean {
  if (!schedule || schedule.freq === 'daily') return true;
  const d = new Date(`${dateYmd}T00:00:00`);
  if (schedule.freq === 'weekly') {
    return schedule.weekdays?.includes(d.getDay()) ?? false;
  }
  if (schedule.freq === 'monthly') {
    return d.getDate() === schedule.monthDay;
  }
  return true;
}

// Sıklık kuralının okunabilir kısa etiketi ("Her gün" / "Pzt·Çar·Cum").
export function scheduleLabel(schedule: Recurrence | null): string {
  if (!schedule || schedule.freq === 'daily') return 'Her gün';
  if (schedule.freq === 'weekly') {
    const wds = schedule.weekdays ?? [];
    if (wds.length === 0 || wds.length === 7) return 'Her gün';
    return WEEKDAY_DISPLAY_ORDER.filter((w) => wds.includes(w))
      .map((w) => WEEKDAY_NAMES[w])
      .join('·');
  }
  return 'Her gün';
}
