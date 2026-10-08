// Görev etiketleri: oluşturma/ad kuralları, yeniden adlandırma, silme ve
// görevin tag_ids alanı (JSON listesi; bozuk değer "etiket yok" okunur).

import { getDb } from '../database';
import { cleanTagName, parseTagIds, tagIdsToJson, tagNameKey, tagRepo, TAG_NAME_MAX_LEN } from '../repositories/tagRepo';
import { taskRepo } from '../repositories/taskRepo';
import { userRepo } from '../repositories/userRepo';
import { resetTestDb } from '../../test/dbTestUtils';

let uid: string;
beforeEach(async () => {
  await resetTestDb();
  uid = userRepo.getOrCreateLocal().id;
});

describe('etiket adı', () => {
  it('kırpılır, iç boşluklar teke iner, sınırda kesilir', () => {
    expect(cleanTagName('  Ev   işleri ')).toBe('Ev işleri');
    expect(cleanTagName('x'.repeat(40))).toHaveLength(TAG_NAME_MAX_LEN);
    expect(cleanTagName('   ')).toBe('');
  });

  it('büyük/küçük harf ve Türkçe I/İ/ı farkı aynı ad sayılır', () => {
    expect(tagNameKey('İş')).toBe(tagNameKey('iş'));
    expect(tagNameKey('IŞ')).toBe(tagNameKey('iş'));
    expect(tagNameKey('Inbox')).toBe(tagNameKey('inbox'));
    expect(tagNameKey('Ev')).not.toBe(tagNameKey('İş'));
  });
});

describe('tagRepo', () => {
  it('oluşturma sırasıyla listeler; boş ad oluşturmaz', () => {
    const a = tagRepo.create(uid, 'İş', '#3b82f6')!;
    const b = tagRepo.create(uid, 'Ev', null)!;
    expect(tagRepo.create(uid, '  ', null)).toBeNull();
    expect(tagRepo.listByUser(uid).map((t) => [t.name, t.color, t.position])).toEqual([
      ['İş', '#3b82f6', 0],
      ['Ev', null, 1],
    ]);
    expect(a.synced).toBe(0);
    expect(b.id).not.toBe(a.id);
  });

  it('aynı ad ikinci kez oluşturulmaz, var olan döner', () => {
    const a = tagRepo.create(uid, 'İş', null)!;
    expect(tagRepo.create(uid, 'iş', '#ef4444')!.id).toBe(a.id);
    expect(tagRepo.listByUser(uid)).toHaveLength(1);
  });

  it('yeniden adlandırma: başka etiketin adına çakışırsa ya da boşsa reddedilir', () => {
    const a = tagRepo.create(uid, 'İş', null)!;
    tagRepo.create(uid, 'Ev', null);
    expect(tagRepo.update(a.id, { name: 'ev' })).toBe(false);
    expect(tagRepo.update(a.id, { name: ' ' })).toBe(false);
    expect(tagRepo.update(a.id, { name: 'IŞ' })).toBe(true); // kendi adının farklı yazımı serbest
    expect(tagRepo.update(a.id, { name: 'Ofis', color: '#10b981' })).toBe(true);
    expect(tagRepo.getById(a.id)).toMatchObject({ name: 'Ofis', color: '#10b981', synced: 0 });
  });

  it('silinen etiket listeden düşer; adı yeniden kullanılabilir', () => {
    const a = tagRepo.create(uid, 'İş', null)!;
    tagRepo.softDelete(a.id);
    expect(tagRepo.listByUser(uid)).toHaveLength(0);
    expect(tagRepo.getById(a.id)).toBeNull();
    expect(tagRepo.create(uid, 'İş', null)!.id).not.toBe(a.id);
  });

  it('countTasks yalnız canlı, kendi görevlerimi sayar', () => {
    const tag = tagRepo.create(uid, 'İş', null)!;
    taskRepo.create({ user_id: uid, title: 'A', tag_ids: [tag.id] });
    taskRepo.create({ user_id: uid, title: 'B', tag_ids: ['baska-etiket-id', tag.id] });
    taskRepo.softDelete(taskRepo.create({ user_id: uid, title: 'C', tag_ids: [tag.id] }).id);
    taskRepo.create({ user_id: uid, title: 'D' });
    expect(tagRepo.countTasks(uid, tag.id)).toBe(2);
  });
});

describe('görevin ikon ve etiketleri', () => {
  it('oluştururken ve güncellerken yazılır, okurken liste döner', () => {
    const a = tagRepo.create(uid, 'İş', null)!;
    const b = tagRepo.create(uid, 'Acil', null)!;
    const t = taskRepo.create({ user_id: uid, title: 'Rapor', icon: 'mail', tag_ids: [a.id] });
    expect(t).toMatchObject({ icon: 'mail', tag_ids: [a.id] });

    taskRepo.update(t.id, { tag_ids: [a.id, b.id, a.id], icon: null });
    expect(taskRepo.getById(t.id)).toMatchObject({ icon: null, tag_ids: [a.id, b.id], synced: 0 });

    taskRepo.update(t.id, { tag_ids: [] });
    expect(taskRepo.getById(t.id)!.tag_ids).toEqual([]);
    const raw = getDb().getFirstSync<{ tag_ids: string | null }>(`SELECT tag_ids FROM tasks WHERE id = ?`, [t.id]);
    expect(raw?.tag_ids).toBeNull(); // etiketsiz = NULL, "[]" değil
  });

  it('dokunulmayan alanlar güncellemede korunur', () => {
    const a = tagRepo.create(uid, 'İş', null)!;
    const t = taskRepo.create({ user_id: uid, title: 'Rapor', icon: 'mail', tag_ids: [a.id] });
    taskRepo.update(t.id, { title: 'Rapor yaz' });
    expect(taskRepo.getById(t.id)).toMatchObject({ title: 'Rapor yaz', icon: 'mail', tag_ids: [a.id] });
  });

  it('bozuk tag_ids "etiket yok" okunur, görev listesi bozulmaz', () => {
    const t = taskRepo.create({ user_id: uid, title: 'Rapor' });
    getDb().runSync(`UPDATE tasks SET tag_ids = '{bozuk' WHERE id = ?`, [t.id]);
    expect(taskRepo.getById(t.id)!.tag_ids).toEqual([]);
    expect(taskRepo.listByUser(uid)).toHaveLength(1);
  });
});

describe('parseTagIds / tagIdsToJson', () => {
  it('yalnız dolu metinleri, tekrarsız tutar', () => {
    expect(parseTagIds('["a","b","a",3,null,""]')).toEqual(['a', 'b']);
    expect(parseTagIds('{"a":1}')).toEqual([]);
    expect(parseTagIds(null)).toEqual([]);
    expect(tagIdsToJson(['a', 'a', 'b'])).toBe('["a","b"]');
    expect(tagIdsToJson([])).toBeNull();
  });
});
