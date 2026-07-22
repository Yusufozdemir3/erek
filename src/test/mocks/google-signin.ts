// Testlerde @react-native-google-signin/google-signin yerine geçer
// (jest.logic.config.js moduleNameMapper). Gerçek paket ESM yayınladığı için
// Node projesinde ayrıştırılamıyor; ayrıca native modül isterdi.
//
// Varsayılan davranış "iptal": Google girişini KULLANAN bir test yazılırsa
// GoogleSignin.signIn'i kendi dublörüyle değiştirmesi gerekir (jest.spyOn).
// Böylece dublör sessizce "başarılı giriş" uydurmuş olmaz.

export interface MockSignInResponse {
  type: 'success' | 'cancelled';
  data: { idToken: string | null } | null;
}

export const GoogleSignin = {
  configure: (_opts: unknown): void => {},
  hasPlayServices: async (_opts?: unknown): Promise<boolean> => true,
  signIn: async (): Promise<MockSignInResponse> => ({ type: 'cancelled', data: null }),
  signOut: async (): Promise<void> => {},
};

export function isSuccessResponse(
  r: MockSignInResponse
): r is MockSignInResponse & { type: 'success'; data: { idToken: string | null } } {
  return r.type === 'success';
}

export function isCancelledResponse(r: MockSignInResponse): boolean {
  return r.type === 'cancelled';
}
