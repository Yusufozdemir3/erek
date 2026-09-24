// Replaces @react-native-google-signin/google-signin in tests
// (jest.logic.config.js moduleNameMapper). The real package ships ESM, so it
// can't be parsed in a Node project; it would also require a native module.
//
// The default behavior is "cancelled": a test that USES Google sign-in must
// replace GoogleSignin.signIn with its own stand-in (jest.spyOn). This way
// the stand-in never silently fakes a "successful sign-in".

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
