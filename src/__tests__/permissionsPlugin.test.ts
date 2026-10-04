// Yayın APK'sında istenmeyen izinler (üstte çizilme, harici depolama) olmamalı:
// eklenti düz satırları siler ve her izin için TEK kaldırma işareti bırakır.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applyRemovals, REMOVED_PERMISSIONS } = require('../../plugins/withoutUnusedPermissions');

const perm = (name: string, remove = false) => ({ $: { 'android:name': name, ...(remove ? { 'tools:node': 'remove' } : {}) } });
const manifest = (perms: ReturnType<typeof perm>[]) => ({ $: {} as Record<string, string>, 'uses-permission': perms });

describe('withoutUnusedPermissions', () => {
  it('düz satırlar silinir, her izin için tek işaret kalır, diğer izinler korunur', () => {
    const m = manifest([
      perm('android.permission.INTERNET'),
      perm('android.permission.SYSTEM_ALERT_WINDOW'),
      perm('android.permission.READ_EXTERNAL_STORAGE'),
      perm('android.permission.WRITE_EXTERNAL_STORAGE'),
      perm('android.permission.WRITE_EXTERNAL_STORAGE', true),
      perm('android.permission.VIBRATE'),
    ]);
    applyRemovals(m);
    const list = m['uses-permission'];
    const names = list.map((p) => p.$['android:name']);
    expect(names).toEqual(expect.arrayContaining(['android.permission.INTERNET', 'android.permission.VIBRATE']));
    for (const r of REMOVED_PERMISSIONS) {
      const entries = list.filter((p) => p.$['android:name'] === r);
      expect(entries).toHaveLength(1);
      expect(entries[0].$['tools:node']).toBe('remove');
    }
    expect(m.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
  });

  it('tekrar çalıştırmak ek işaret üretmez (artımlı prebuild)', () => {
    const m = manifest([perm('android.permission.INTERNET')]);
    applyRemovals(m);
    applyRemovals(m);
    applyRemovals(m);
    expect(m['uses-permission']).toHaveLength(1 + REMOVED_PERMISSIONS.length);
  });

  it('izin listesi hiç yoksa da çalışır', () => {
    const m = { $: {} as Record<string, string> } as never;
    applyRemovals(m);
    expect((m as { 'uses-permission': unknown[] })['uses-permission']).toHaveLength(REMOVED_PERMISSIONS.length);
  });
});
