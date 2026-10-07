// Sentry crash reporting, active only in release builds with
// EXPO_PUBLIC_SENTRY_DSN set; without it nothing happens.
//
// Traces are minified: the Sentry config plugin (build-time source-map upload)
// isn't in app.json, because without SENTRY_AUTH_TOKEN it breaks the Gradle
// build. Crashes are still caught (the native module autolinks). To add it:
//   1) sentry.io › Auth Tokens: a token with project:releases + org:read;
//   2) give it to the build — `eas secret:create --name SENTRY_AUTH_TOKEN`, or
//      an environment variable for a local Gradle build (not in android/,
//      which prebuild --clean deletes);
//   3) add ['@sentry/react-native', { organization: 'yusuf-01', project: 'erek' }] to the plugins;
//   4) check a test build shows readable traces.

import * as Sentry from '@sentry/react-native';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const isSentryConfigured = Boolean(dsn);

if (isSentryConfigured) {
  // tracesSampleRate 0: no performance tracing (crash capture is separate).
  // Unused data, it eats the free quota, and the privacy policy promises no
  // usage analytics.
  Sentry.init({
    dsn,
    // Off in development: dev errors drowned real crashes and ate the quota.
    // Verify Sentry with a release build.
    enabled: !__DEV__,
    tracesSampleRate: 0,
    // Explicit, not the default: privacy policy §5 promises no identifying data.
    sendDefaultPii: false,
    // Breadcrumbs (console output, tapped-element labels) and the user/request
    // blocks can carry the content of habits and tasks; the policy promises a
    // report without it — see sentryScrub.ts for what survives.
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
    beforeSend: (event) => scrubEvent(event),
  });
}

export { Sentry };
