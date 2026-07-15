// Form giriş sınırları — kazara çok uzun metin/sayı girişini engeller (kart
// görünümünde satır taşmasını ve anlamsız büyük sayıları önler). Bir iş kuralı
// değil, pratik bir güvenlik/estetik sınırı; TextInput'un `maxLength` prop'una
// verilir. Tek yerden yönetilir ki tüm formlarda (alışkanlık/görev/hedef) tutarlı
// kalsın.

export const TITLE_MAX_LEN = 60; // alışkanlık/görev/hedef/alt görev başlığı
export const UNIT_MAX_LEN = 20; // birim metni (ör. "bardak", "km")
export const NUMBER_MAX_LEN = 9; // büyük sayısal alanlar (hedef değer, mevcut değer)
export const SHORT_NUMBER_MAX_LEN = 4; // küçük sayısal alanlar (günlük miktar, dakika, oran)
