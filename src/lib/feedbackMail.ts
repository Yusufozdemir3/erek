// The "send feedback" mail: a mailto link whose body ends with a technical
// footer (app and Android version) so a report can be reproduced. It carries
// NOTHING about the user's data — no habit titles, no account, no ids — and it
// is only a link: the user reads the draft in their mail app and sends it (or not).

export const CONTACT_EMAIL = 'yazgandev@gmail.com';

export interface FeedbackFooter {
  appVersion: string;
  androidVersion: string | number;
  lang: string;
}

export function feedbackMailto(subject: string, intro: string, f: FeedbackFooter): string {
  const body = `${intro}\n\n\n— — —\nErek ${f.appVersion} · Android ${f.androidVersion} · ${f.lang}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
