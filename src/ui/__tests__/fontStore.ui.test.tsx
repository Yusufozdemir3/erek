// Yazı tipi seçimi: kayıtlı seçim açılışta geri gelir, bilinmeyen/bozuk değer
// varsayılana düşer, yükleme başarısız olursa telefonun yazı tipine inilir,
// değiştirince kalıcı olur ve dinleyiciler (her Text) haberdar edilir.

import AsyncStorage from '@react-native-async-storage/async-storage';

// Her testte modül yeniden yüklendiği için (jest.isolateModules) AsyncStorage da yeni bir
// örnek olurdu; hepsi aynı bellek tablosunu kullansın.
const mockMem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockMem.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockMem.set(k, v);
    },
    clear: async () => mockMem.clear(),
  },
}));

const mockLoadAsync = jest.fn(async (_files: Record<string, number>) => {});
jest.mock('expo-font', () => ({ loadAsync: (f: Record<string, number>) => mockLoadAsync(f) }));
// .ttf varlıkları jest'te çözülmez; her aile için sahte beş dosya yeter.
jest.mock('../fontAssets', () => {
  const fake = (p: string) => ({
    [`${p}_400Regular`]: 1,
    [`${p}_500Medium`]: 2,
    [`${p}_600SemiBold`]: 3,
    [`${p}_700Bold`]: 4,
    [`${p}_800ExtraBold`]: 5,
  });
  return {
    FONT_FILES: {
      jakarta: fake('PlusJakartaSans'),
      inter: fake('Inter'),
      nunito: fake('Nunito'),
      manrope: fake('Manrope'),
      dmsans: fake('DMSans'),
      poppins: fake('Poppins'),
    },
  };
});

type Store = typeof import('../fontStore');
function freshStore(): Store {
  let s!: Store;
  jest.isolateModules(() => {
    s = require('../fontStore');
  });
  return s;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockLoadAsync.mockClear();
  mockLoadAsync.mockImplementation(async () => {});
});

describe('initFont', () => {
  it('hiçbir şey kayıtlı değilse telefonun kendi yazı tipi kalır (varsayılan), dosya yüklenmez', async () => {
    const s = freshStore();
    await s.initFont();
    expect(s.getFontChoice()).toBe('system');
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  it('kayıtlı seçimi geri getirir ve yalnız onun dosyalarını yükler', async () => {
    await AsyncStorage.setItem('font:choice', 'nunito');
    const s = freshStore();
    await s.initFont();
    expect(s.getFontChoice()).toBe('nunito');
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    expect(Object.keys(mockLoadAsync.mock.calls[0][0])).toContain('Nunito_400Regular');
  });

  it('bozuk kayıt varsayılana düşer', async () => {
    await AsyncStorage.setItem('font:choice', 'comic-sans');
    const s = freshStore();
    await s.initFont();
    expect(s.getFontChoice()).toBe('system');
  });

  it('"system" kayıtlıysa hiçbir dosya yüklenmez', async () => {
    await AsyncStorage.setItem('font:choice', 'system');
    const s = freshStore();
    await s.initFont();
    expect(s.getFontChoice()).toBe('system');
    expect(mockLoadAsync).not.toHaveBeenCalled();
  });

  it('dosyalar yüklenemezse çökmez, telefonun yazı tipine iner', async () => {
    await AsyncStorage.setItem('font:choice', 'nunito');
    mockLoadAsync.mockRejectedValueOnce(new Error('asset missing'));
    const s = freshStore();
    await expect(s.initFont()).resolves.toBeUndefined();
    expect(s.getFontChoice()).toBe('system');
  });
});

describe('setFontChoice', () => {
  it('yükler, kalıcı yazar ve dinleyicileri haberdar eder', async () => {
    const s = freshStore();
    await s.initFont();
    const seen: string[] = [];
    const off = s.subscribeFont(() => seen.push(s.getFontChoice()));

    await expect(s.setFontChoice('poppins')).resolves.toBe(true);
    expect(s.getFontChoice()).toBe('poppins');
    expect(seen).toEqual(['poppins']);
    expect(await AsyncStorage.getItem('font:choice')).toBe('poppins');
    off();
  });

  it('aynı aileyi ikinci kez yüklemez', async () => {
    const s = freshStore();
    await s.initFont();
    mockLoadAsync.mockClear();
    await s.setFontChoice('inter');
    await s.setFontChoice('inter');
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
  });

  it('yükleme başarısızsa seçim değişmez, kayıt yazılmaz', async () => {
    const s = freshStore();
    await s.initFont();
    mockLoadAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(s.setFontChoice('manrope')).resolves.toBe(false);
    expect(s.getFontChoice()).toBe('system');
    expect(await AsyncStorage.getItem('font:choice')).toBeNull();
  });

  it('"system" dosya yüklemeden geçer', async () => {
    const s = freshStore();
    await s.initFont();
    mockLoadAsync.mockClear();
    await expect(s.setFontChoice('system')).resolves.toBe(true);
    expect(mockLoadAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('font:choice')).toBe('system');
  });
});
