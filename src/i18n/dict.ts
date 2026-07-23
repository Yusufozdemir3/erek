// Çeviri sözlüğünün tipi. Ayrı dosyada çünkü dil dosyaları (tr/en/de) bunu
// import ediyor ve translations.ts de onları import ediyor — tip burada
// dururken döngüsel import oluşmuyor.

export type Dict = Record<string, string>;
