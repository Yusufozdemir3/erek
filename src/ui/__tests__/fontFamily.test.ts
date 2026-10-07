import * as fs from 'fs';
import {
  DEFAULT_FONT,
  FONT_CHOICES,
  FONT_NAMES,
  fontFamilyFor,
  isFontChoice,
  weightNameFor,
  type BundledFont,
} from '../fontFamily';

describe('weightNameFor', () => {
  it('fontWeight değerini kalınlık adına çevirir', () => {
    expect(weightNameFor('400')).toBe('regular');
    expect(weightNameFor('500')).toBe('medium');
    expect(weightNameFor('600')).toBe('semibold');
    expect(weightNameFor(600)).toBe('semibold');
    expect(weightNameFor('700')).toBe('bold');
    expect(weightNameFor('bold')).toBe('bold');
    expect(weightNameFor('800')).toBe('extrabold');
    expect(weightNameFor('900')).toBe('extrabold');
  });

  it('ağırlık verilmemişse ya da bilinmiyorsa normal', () => {
    expect(weightNameFor(undefined)).toBe('regular');
    expect(weightNameFor('normal')).toBe('regular');
    expect(weightNameFor('300')).toBe('regular');
  });
});

describe('fontFamilyFor', () => {
  it('seçime ve kalınlığa göre gömülü dosyanın aile adını verir', () => {
    expect(fontFamilyFor('inter', '700')).toBe('Inter_700Bold');
    expect(fontFamilyFor('jakarta', '600')).toBe('PlusJakartaSans_600SemiBold');
    expect(fontFamilyFor('dmsans', undefined)).toBe('DMSans_400Regular');
    expect(fontFamilyFor('nunito', '800')).toBe('Nunito_800ExtraBold');
  });

  it('"system" seçiminde telefonun kendi yazı tipi kalır (aile yok)', () => {
    expect(fontFamilyFor('system', '700')).toBeUndefined();
  });
});

describe('seçim doğrulama', () => {
  it('yalnız bilinen seçimler geçerli; varsayılan geçerli bir seçim', () => {
    expect(isFontChoice('nunito')).toBe(true);
    expect(isFontChoice('system')).toBe(true);
    expect(isFontChoice('comic')).toBe(false);
    expect(isFontChoice(undefined)).toBe(false);
    expect(isFontChoice(null)).toBe(false);
    expect(isFontChoice(DEFAULT_FONT)).toBe(true);
  });

  it('her gömülü yazı tipinin adı vardır', () => {
    for (const c of FONT_CHOICES) if (c !== 'system') expect(FONT_NAMES[c]).toBeTruthy();
  });
});

describe('adlar @expo-google-fonts paketlerinin dışa aktardıklarıyla aynı', () => {
  // Font.loadAsync anahtarı = aile adı. Paketleri yüklemeyiz (.ttf varlıkları Node'da
  // çözülmez); dışa aktarma adları tür dosyalarında yazılı.
  const PACKAGE: Record<BundledFont, string> = {
    jakarta: 'plus-jakarta-sans',
    inter: 'inter',
    nunito: 'nunito',
    manrope: 'manrope',
    dmsans: 'dm-sans',
    poppins: 'poppins',
  };

  for (const choice of Object.keys(PACKAGE) as BundledFont[]) {
    it(`${FONT_NAMES[choice]}: beş kalınlığın hepsi pakette var`, () => {
      const types = fs.readFileSync(require.resolve(`@expo-google-fonts/${PACKAGE[choice]}/index.d.ts`), 'utf8');
      for (const w of ['400', '500', '600', '700', '800']) expect(types).toContain(fontFamilyFor(choice, w));
    });
  }
});
