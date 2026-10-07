// App-level switches.

// Google sign-in + cloud sync. Data leaves the device only after the user signs
// in (sync/auth.ts) — what privacy policy §1, the login screen and Play's Data
// Safety form all promise. Also needs the Supabase and Google client ids in .env.
export const ACCOUNTS_ENABLED = true;

// docs/privacy-policy.md, published from the separate erek-privacy repo.
export const PRIVACY_POLICY_URL = 'https://yusufozdemir3.github.io/erek-privacy/';
