// What the user sees when a screen crashes while rendering, instead of the app
// closing. Used as the root route's ErrorBoundary (app/_layout.tsx), which
// expo-router mounts OUTSIDE our providers — so this screen needs nothing from
// them: system light/dark, and its own three-language text picked from the
// device language.
//
// The error is reported once (technical report only, see lib/sentryScrub.ts).
// "Try again" re-renders the route; if it keeps failing the user can still
// close the app — their data is untouched (nothing was written by the crash).

import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { getLocales } from 'expo-localization';

const TEXT = {
  tr: { title: 'Bir şeyler ters gitti', body: 'Verilerin güvende. Yeniden denemek çoğu zaman yeter.', retry: 'Yeniden dene' },
  en: { title: 'Something went wrong', body: 'Your data is safe. Trying again usually does the trick.', retry: 'Try again' },
  de: { title: 'Etwas ist schiefgelaufen', body: 'Deine Daten sind sicher. Meist hilft ein neuer Versuch.', retry: 'Erneut versuchen' },
} as const;

export function crashText(languageCode: string | null | undefined) {
  return languageCode === 'tr' || languageCode === 'de' ? TEXT[languageCode] : TEXT.en;
}

interface Props {
  error: Error;
  retry: () => void | Promise<void>;
  // Injected so tests don't load the native Sentry module; the root layout passes the real one.
  report?: (error: Error) => void;
}

export function CrashScreen({ error, retry, report }: Props) {
  const dark = useColorScheme() === 'dark';
  const text = crashText(getLocales()[0]?.languageCode);
  const reported = useRef<Error | null>(null);

  useEffect(() => {
    if (reported.current === error) return;
    reported.current = error;
    try {
      report?.(error);
    } catch {
      // reporting must never make the crash screen crash
    }
  }, [error, report]);

  const bg = dark ? '#14161a' : '#f8fafc';
  const fg = dark ? '#f1f5f9' : '#0f172a';
  const muted = dark ? '#94a3b8' : '#64748b';
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <Text style={[styles.title, { color: fg }]}>{text.title}</Text>
      <Text style={[styles.body, { color: muted }]}>{text.body}</Text>
      <Pressable
        onPress={() => void retry()}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel={text.retry}
      >
        <Text style={styles.btnText}>{text.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn: { marginTop: 12, backgroundColor: '#2f5d45', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
