// The translation dictionary's type. Kept in a separate file because the
// language files (tr/en/de) import it and translations.ts imports them —
// keeping the type here avoids a circular import.

export type Dict = Record<string, string>;
