// The typefaces the user can pick in Profile › Appearance, and the mapping from
// (choice, fontWeight) to the bundled font file. Android cannot pick a weight
// out of a custom font family — each weight is its own family name — so the
// app resolves it here (see applyFont.ts).
//
// Pure (no react-native import) so the Node test project can cover it.

export const FONT_CHOICES = ['jakarta', 'inter', 'nunito', 'manrope', 'dmsans', 'poppins', 'system'] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];
export type BundledFont = Exclude<FontChoice, 'system'>;

export const DEFAULT_FONT: FontChoice = 'system';

export const FONT_NAMES: Record<BundledFont, string> = {
  jakarta: 'Plus Jakarta Sans',
  inter: 'Inter',
  nunito: 'Nunito',
  manrope: 'Manrope',
  dmsans: 'DM Sans',
  poppins: 'Poppins',
};

// The prefix @expo-google-fonts gives each family's files: <Prefix>_400Regular …
const PREFIX: Record<BundledFont, string> = {
  jakarta: 'PlusJakartaSans',
  inter: 'Inter',
  nunito: 'Nunito',
  manrope: 'Manrope',
  dmsans: 'DMSans',
  poppins: 'Poppins',
};

export const FONT_WEIGHT_SUFFIX = {
  regular: '400Regular',
  medium: '500Medium',
  semibold: '600SemiBold',
  bold: '700Bold',
  extrabold: '800ExtraBold',
} as const;
export type FontWeightName = keyof typeof FONT_WEIGHT_SUFFIX;

export function isFontChoice(value: unknown): value is FontChoice {
  return typeof value === 'string' && (FONT_CHOICES as readonly string[]).includes(value);
}

export function weightNameFor(weight: string | number | undefined): FontWeightName {
  switch (String(weight ?? '400')) {
    case '500':
      return 'medium';
    case '600':
      return 'semibold';
    case '700':
    case 'bold':
      return 'bold';
    case '800':
    case '900':
      return 'extrabold';
    default:
      // 100–300, 400, 'normal', anything unknown
      return 'regular';
  }
}

// The family name of a weight, or undefined for the phone's own font.
export function fontFamilyFor(choice: FontChoice, weight: string | number | undefined): string | undefined {
  if (choice === 'system') return undefined;
  return `${PREFIX[choice]}_${FONT_WEIGHT_SUFFIX[weightNameFor(weight)]}`;
}

// The five family names a choice needs loaded.
export function fontFamilyNames(choice: BundledFont): string[] {
  return (Object.keys(FONT_WEIGHT_SUFFIX) as FontWeightName[]).map((w) => `${PREFIX[choice]}_${FONT_WEIGHT_SUFFIX[w]}`);
}
