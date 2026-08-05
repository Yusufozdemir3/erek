// Çeviri sözlüğü. Kaynak dil Türkçe'dir (tr) ve aynı zamanda YEDEK dildir:
// bir anahtar seçili dilde yoksa Türkçe karşılığı gösterilir (uygulama asla
// çeviri eksikliğinden boş/kırık metin göstermez). Anahtarlar noktalı ad
// alanlarıyla düzenlenir (ör. 'tabs.today'). {param} yer tutucuları t()'nin
// ikinci argümanıyla doldurulur.

import type { Dict } from '@/i18n/dict';
import { tr } from '@/i18n/tr';
import { en } from '@/i18n/en';
import { de } from '@/i18n/de';

export type Lang = 'tr' | 'en' | 'de';
export const SUPPORTED_LANGS: Lang[] = ['tr', 'en', 'de'];

// Dil seçicide gösterilecek adlar (kendi dilinde).
export const LANG_LABELS: Record<Lang, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
};

export const translations: Record<Lang, Dict> = { tr, en, de };

// Verilen dilde bir anahtarı çevirir; {param} yer tutucularını doldurur.
// useI18n().t() bunu sarmalar; ayrıca React dışı modüllerin (ör. bildirimler)
// mevcut dili elle okuyup çeviri yapması için de doğrudan kullanılabilir.
//
// ÇOĞUL (tekil biçim): `n` parametresi 1 ise önce `<anahtar>_one` denenir.
// Anahtarın KENDİSİ çoğul ("other") biçimdir — bu sayede çoğul gerektirmeyen
// yüzlerce anahtar hiç değişmez ve mevcut tüm çağrılar aynen çalışır; yalnızca
// tekil hâli farklı olanlara bir `_one` kardeşi eklenir.
// Neden gerekti: Türkçe sayıdan sonra çoğul eki almaz ("1 gün kaldı" / "3 gün
// kaldı"), bu yüzden tek şablon Türkçe'de doğru görünüyordu — ama İngilizce'de
// "1 days left", Almanca'da "Noch 1 Tage" / "Vor 1 Tagen" çıkıyordu.
// NOT: bu, tam bir CLDR çoğul motoru DEĞİL (Lehçe/Rusça gibi few/many kategorisi
// olan diller için yetmez). Desteklenen üç dilin üçü de one/other ayrımıyla
// yetindiği için bilinçli olarak bu kadarı yapıldı.
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const oneKey = params?.n === 1 ? `${key}_one` : null;
  // Seçili dil → Türkçe yedek → anahtarın kendisi (son çare).
  // Tekil biçim aranıyorsa o da aynı zinciri izler, bulunamazsa çoğula düşer.
  let s =
    (oneKey ? translations[lang][oneKey] ?? translations.tr[oneKey] : undefined) ??
    translations[lang][key] ??
    translations.tr[key] ??
    key;
  if (params) {
    for (const [k, val] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    }
  }
  return s;
}
