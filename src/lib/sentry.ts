// Sentry crash reporting. Credentials are read from .env (EXPO_PUBLIC_-prefixed
// vars get embedded at build time). If there's no DSN, Sentry silently stays
// disabled — same pattern as isSyncConfigured in supabase.ts: missing config
// never crashes anything, the feature just stays inactive.
//
// CURRENT STATE (2026-08-04): Sentry is ON — DSN is set in .env, runtime
// crashes land in the dashboard. Turned on because the app is live and there's
// no other observability tool (before this, a user crash would go unnoticed).
//
// STILL MISSING — STACK TRACES ARE MINIFIED: the Sentry EXPO CONFIG PLUGIN in
// app.json is still commented out (commit af0fa17): the plugin's build-time
// source-map upload step breaks the Android build in gradle without a
// SENTRY_AUTH_TOKEN. Since the native module is autolinked, errors ARE CAUGHT
// even without the plugin; all the plugin adds is a readable (de-minified)
// trace in the dashboard.
// TO ENABLE IT — ORDER MATTERS (token first, or the build breaks):
//   (1) sentry.io > Settings > Auth Tokens: create a token with project:releases + org:read scope;
//   (2) supply the token to the build environment — for an EAS build, `eas secret:create
//       --name SENTRY_AUTH_TOKEN`; for a LOCAL Gradle build, the EAS secret DOESN'T WORK,
//       the token must be set as an environment variable before invoking gradlew (don't
//       write it into the android/ folder: prebuild --clean deletes it);
//   (3) add this to app.json's plugins (organization SLUG already known — taken from the dashboard):
//       ['@sentry/react-native', { organization: 'yusuf-01', project: 'erek' }]
//   (4) do a verification build and confirm the trace shows up readable in the dashboard.

import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryConfigured = Boolean(dsn);

if (isSentryConfigured) {
  // tracesSampleRate: the sampling rate for PERFORMANCE tracing — this has
  // NOTHING to do with crash capture, which is separate and always runs
  // regardless of this setting.
  // 0 = performance tracing fully disabled. Three reasons:
  //   - Nobody consumes this data; all we want is crash visibility.
  //   - Leaves the free quota for crashes (used to be 1.0: sent everything).
  //   - Keeps the privacy policy's "no usage analytics collected" promise
  //     unambiguous — transaction/timing data would fall into a gray area of that promise.
  Sentry.init({
    dsn,
    // FULLY DISABLED IN DEVELOPMENT. Two reasons: (1) errors we generate while
    // developing landed in the same dashboard as real user crashes, drowning
    // the signal in noise; (2) it was burning the free plan's monthly error
    // quota. The cost of this: Sentry working can only be verified with a
    // REAL build — throwing a test error via `expo start` now sends nothing
    // (expected behavior).
    enabled: !__DEV__,
    tracesSampleRate: 0,
    // sendDefaultPii: the SDK's default is also false, but this is set
    // EXPLICITLY — this line is the code-level equivalent of the "we don't
    // send identifying information" promise made in §5 of the privacy policy.
    // Relying on the default would mean an SDK upgrade could silently break that promise.
    sendDefaultPii: false,
  });
}

export { Sentry };
