// App-level feature flags.

// Cloud account + sync feature. NOW ENABLED.
// It used to be disabled because "there's no password-reset flow, so a user
// who forgets their account shouldn't get locked out"; since login is
// Google-ONLY (see ui/LoginScreen.tsx) there's no password involved, so that
// lockout risk doesn't exist either.
// WHAT CHANGES WHEN ENABLED — pre-release checklist:
//   - Data LEAVES the device — BUT ONLY IF THE USER SIGNED IN. Without sign-in,
//     sync never starts: ensureSignedIn doesn't authenticate, it returns null
//     (see sync/auth.ts). This is the code-level counterpart of privacy policy
//     §1 and the login screen's promise ('login.localNote') — if one changes,
//     all three must change together. The Data Safety declaration in Play
//     Console should match: data collection marked as "optional".
//   - The mandatory account-deletion flow kicks in; it's ready (deleteAccountAndData
//     + the server-side delete_account RPC) and must be declared in Play's
//     account deletion form.
//   - The login screen is shown once on first launch (skippable via "Skip for
//     now"); without signing in, the app keeps working fully locally as before.
// Note: this flag is independent of env vars but is NOT sufficient on its own —
// if Supabase (and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for Google sign-in) aren't
// defined in .env, sync and the sign-in button stay disabled regardless.
export const ACCOUNTS_ENABLED = true;
