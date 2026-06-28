// Repository'lerin paylaştığı küçük yardımcılar.

import * as Crypto from 'expo-crypto';

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
