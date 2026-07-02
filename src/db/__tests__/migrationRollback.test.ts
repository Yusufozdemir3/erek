// Migration transaction davranışı: çok deyimli bir migration yarıda kalırsa
// TAMAMI geri alınmalı ve user_version ilerlememeli. (Aksi halde yarım şema
// + tekrar denemede "duplicate/already exists" hatasıyla açılış kilitlenir.)
//
// Gerçek migration listesi yerine bilerek bozuk bir liste enjekte edilir;
// bu dosya kendi modül kaydına sahip olduğundan diğer testleri etkilemez.

jest.mock('../migrations/001_initial', () => ({
  migrations: [
    { version: 1, sql: 'CREATE TABLE saglam (id TEXT PRIMARY KEY);' },
    {
      version: 2,
      // 1. deyim başarılı, 2. deyim patlar (aynı tablo adı).
      sql: 'CREATE TABLE yarim (id TEXT); CREATE TABLE yarim (id TEXT);',
    },
  ],
}));

import { getDb, runMigrations } from '../database';

function tableNames(): string[] {
  return getDb()
    .getAllSync<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .map((r) => r.name);
}

function userVersion(): number {
  return getDb().getFirstSync<{ user_version: number }>('PRAGMA user_version;')!.user_version;
}

describe('yarıda kalan migration', () => {
  it('hata fırlatır, başarılı deyimleri geri alır ve user_version ilerletmez', async () => {
    await expect(runMigrations()).rejects.toThrow();

    // v1 tamamlandı, v2 tamamen geri alındı.
    expect(userVersion()).toBe(1);
    expect(tableNames()).toContain('saglam');
    // Transaction olmasaydı v2'nin ilk deyimi kalıcı olurdu.
    expect(tableNames()).not.toContain('yarim');
  });

  it('sonraki deneme temiz durumdan tekrar başlar', async () => {
    await expect(runMigrations()).rejects.toThrow();
    // Yarım şema kalmadığı için aynı hatayla yeniden dener — "yarim zaten var"
    // gibi ikincil bir hataya sürüklenmez ve durum bozulmaz.
    await expect(runMigrations()).rejects.toThrow(/already exists|exists/i);
    expect(userVersion()).toBe(1);
    expect(tableNames()).not.toContain('yarim');
  });
});
