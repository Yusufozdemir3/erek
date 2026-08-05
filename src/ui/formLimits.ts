// Form giriş sınırları — kazara çok uzun metin/sayı girişini engeller (kart
// görünümünde satır taşmasını ve anlamsız büyük sayıları önler). Bir iş kuralı
// değil, pratik bir güvenlik/estetik sınırı; TextInput'un `maxLength` prop'una
// verilir. Tek yerden yönetilir ki tüm formlarda (alışkanlık/görev/hedef) tutarlı
// kalsın.

export const TITLE_MAX_LEN = 60; // alışkanlık/görev/hedef/alt görev başlığı

// Bir varlığın (alışkanlık/görev/hedef) alabileceği en fazla hatırlatma saati.
// Diğer sınırlardan farklı olarak bu SALT estetik değil, teknik bir tavan:
// her hatırlatma birden çok OS tetikleyicisine açılır (haftalık sıklıkta seçili
// gün sayısı kadar, "her X günde bir"de 8 tane). Sınırsız bırakıldığında tek bir
// alışkanlık onlarca tetikleyici üretebiliyordu — iOS'ta bekleyen yerel bildirim
// tavanı 64'tür ve aşıldığında fazlası SESSİZCE düşer (kullanıcı hatırlatmasının
// neden çalmadığını asla anlayamaz). 5, gerçekçi kullanımın çok üstünde ama
// patlamayı engelliyor.
export const MAX_REMINDERS_PER_ENTITY = 5;
export const UNIT_MAX_LEN = 20; // birim metni (ör. "bardak", "km")
export const NUMBER_MAX_LEN = 9; // büyük sayısal alanlar (hedef değer, mevcut değer)
export const SHORT_NUMBER_MAX_LEN = 4; // küçük sayısal alanlar (günlük miktar, dakika, oran)
